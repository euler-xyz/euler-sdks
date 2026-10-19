import {
	createSubgraphCallBundler,
	resolveSubgraphRead,
	SubgraphUnavailableError,
	type SubgraphReadOptions,
	type SubgraphReadResult,
	validateSubgraphDeployment,
	type SubgraphSource,
	type SubgraphResolver,
} from "../../../../utils/subgraphCatalog.js";
import { type Address, getAddress } from "viem";
import type { IAccountVaultsAdapter } from "./accountOnchainAdapter.js";
import { getAddressPrefix } from "../../../../utils/subAccounts.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";

export interface AccountVaults {
	[vault: Address]: {
		deposits: Address[];
		borrows: Address[];
	};
}

export interface AccountVaultsSubgraphAdapterConfig {
	subgraphURLs: Record<number, string | false>;
	resolver?: SubgraphResolver;
}

const PAGE_SIZE = 1000;

export class AccountVaultsSubgraphAdapter implements IAccountVaultsAdapter {
	private readonly sources = new Map<number, SubgraphSource>();
	private readonly builtInQuery: typeof this.queryAccountVaults;
	constructor(
		private readonly config: AccountVaultsSubgraphAdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		const uncached = this.queryAccountVaults;
		if (buildQuery) applyBuildQuery(this, buildQuery);
		if (config.resolver) {
			const configured = this.queryAccountVaults;
			// Catalog reads evaluate freshness and retirement; explicit maps retain query wrappers.
			this.queryAccountVaults = (key) =>
				config.subgraphURLs[key.chainId] ? configured(key) : uncached(key);
		}
		this.builtInQuery = this.queryAccountVaults;
	}

	private readonly loadAccountVaults = createSubgraphCallBundler(
		async (
			keys: ({
				chainId: number;
				account: Address;
				withSource?: boolean;
			} & SubgraphReadOptions)[],
		): Promise<SubgraphReadResult<any>[]> => {
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const arr = byChain.get(key.chainId) ?? [];
				arr.push(key.account);
				byChain.set(key.chainId, arr);
			}

			const chainResults = new Map<number, Map<string, any>>();
			let readSource: SubgraphSource | undefined;
			for (const [chainId, accounts] of byChain) {
				const { endpoint: subgraphUrl, source } = await resolveSubgraphRead(
					chainId,
					"account-vault-discovery",
					this.config.subgraphURLs,
					this.config.resolver,
					keys[0]?.withSource ? undefined : this.sources,
					keys[0]?.expectedSource,
				);
				if (!subgraphUrl) continue;
				readSource = source;

				const ids = [
					...new Set(accounts.map((a) => getAddressPrefix(a).toLowerCase())),
				];
				const query = `query AccountVaults($ids: [String!]!) {
              ${source ? "_meta { deployment }" : ""}
              trackingActiveAccounts(first: ${PAGE_SIZE}, where: { id_in: $ids }) {
                id
                deposits
                borrows
              }
            }`;
				const map = new Map<string, any>();
				for (let i = 0; i < ids.length; i += PAGE_SIZE) {
					const response = await fetch(subgraphUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							query,
							variables: { ids: ids.slice(i, i + PAGE_SIZE) },
							operationName: "AccountVaults",
						}),
					});
					if (!response.ok) {
						throw new Error(
							`Account vaults subgraph ${response.status} ${response.statusText}`,
						);
					}
					const json = (await response.json()) as {
						data?: {
							trackingActiveAccounts?: Array<{
								id: string;
								deposits: string[];
								borrows: string[];
							}>;
						};
						errors?: unknown[];
					};
					if (json?.errors?.length) {
						throw new Error("Account vaults subgraph returned GraphQL errors.");
					}
					validateSubgraphDeployment(json, chainId, source);
					if (!Array.isArray(json?.data?.trackingActiveAccounts)) {
						throw new Error(
							"Account vaults subgraph returned malformed account data.",
						);
					}
					for (const entry of json.data.trackingActiveAccounts) {
						if (
							typeof entry?.id !== "string" ||
							!Array.isArray(entry.deposits) ||
							!Array.isArray(entry.borrows)
						) {
							throw new Error(
								"Account vaults subgraph returned malformed account data.",
							);
						}
						map.set(entry.id.toLowerCase(), entry);
					}
				}
				chainResults.set(chainId, map);
			}

			return keys.map((key) => {
				const prefix = getAddressPrefix(key.account);
				const entry = chainResults.get(key.chainId)?.get(prefix.toLowerCase());
				return {
					value: { data: { trackingActiveAccount: entry ?? null } },
					...(readSource ? { source: { ...readSource } } : {}),
				};
			});
		},
	);

	queryAccountVaults = async (key: {
		chainId: number;
		account: Address;
	}): Promise<any> => (await this.loadAccountVaults(key)).value;

	setQueryAccountVaults(fn: typeof this.queryAccountVaults): void {
		this.queryAccountVaults = fn;
	}

	/** Keep the returned source with the baseline of a multi-read operation. */
	async fetchAccountVaultsWithSource(
		chainId: number,
		account: Address,
		options: SubgraphReadOptions = {},
	): Promise<SubgraphReadResult<AccountVaults>> {
		if (
			this.queryAccountVaults === this.builtInQuery &&
			this.config.subgraphURLs[chainId] === false
		)
			throw new SubgraphUnavailableError("disabled", chainId);
		if (
			this.queryAccountVaults !== this.builtInQuery ||
			this.config.subgraphURLs[chainId] ||
			!this.config.resolver
		) {
			if (options.expectedSource)
				throw new SubgraphUnavailableError("source-changed", chainId);
			return { value: await this.fetchAccountVaults(chainId, account) };
		}
		const result = await this.loadAccountVaults({
			chainId,
			account,
			withSource: true,
			expectedSource: options.expectedSource
				? { ...options.expectedSource }
				: undefined,
		});
		return {
			value: this.parseAccountVaults(result.value),
			source: result.source,
		};
	}

	async fetchAccountVaults(
		chainId: number,
		account: Address,
	): Promise<AccountVaults> {
		return this.parseAccountVaults(
			await this.queryAccountVaults({ chainId, account }),
		);
	}

	private parseAccountVaults(data: any): AccountVaults {
		const parseResult = (
			type: "deposits" | "borrows",
			results: AccountVaults,
			data: any,
		) => {
			data.forEach((entry: any) => {
				const subAccount = getAddress(entry.substring(0, 42));
				const vault = getAddress(`0x${entry.substring(42)}`);
				if (!results[subAccount]) {
					results[subAccount] = {
						deposits: [],
						borrows: [],
					};
				}
				results[subAccount][type].push(vault);
			});
		};

		const accountVaults: AccountVaults = {};
		parseResult(
			"deposits",
			accountVaults,
			data.data?.trackingActiveAccount?.deposits || [],
		);
		parseResult(
			"borrows",
			accountVaults,
			data.data?.trackingActiveAccount?.borrows || [],
		);

		return accountVaults;
	}
}
