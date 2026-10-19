import {
	createSubgraphCallBundler,
	resolveSubgraphEndpoint,
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
	}

	queryAccountVaults = createSubgraphCallBundler(
		async (keys: { chainId: number; account: Address }[]): Promise<any[]> => {
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const arr = byChain.get(key.chainId) ?? [];
				arr.push(key.account);
				byChain.set(key.chainId, arr);
			}

			const chainResults = new Map<number, Map<string, any>>();
			for (const [chainId, accounts] of byChain) {
				const subgraphUrl = await resolveSubgraphEndpoint(
					chainId,
					"account-vault-discovery",
					this.config.subgraphURLs,
					this.config.resolver,
					this.sources,
				);
				if (!subgraphUrl) continue;
				const source =
					this.config.resolver && !this.config.subgraphURLs[chainId]
						? this.sources.get(chainId)
						: undefined;

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
					data: {
						trackingActiveAccount: entry ?? null,
					},
				};
			});
		},
	);

	setQueryAccountVaults(fn: typeof this.queryAccountVaults): void {
		this.queryAccountVaults = fn;
	}

	async fetchAccountVaults(
		chainId: number,
		account: Address,
	): Promise<AccountVaults> {
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
		const data = await this.queryAccountVaults({ chainId, account });

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
