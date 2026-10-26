import {
	querySubgraphAccounts,
	type SubgraphQueryOptions,
	hasSubgraphQuerySource,
} from "../../../../utils/subgraphQueries.js";
import {
	createSubgraphCallBundler,
	resolveSubgraphRead,
	SubgraphUnavailableError,
	type SubgraphReadOptions,
	type SubgraphReadResult,
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
	queryOptions?: SubgraphQueryOptions;
}

export class AccountVaultsSubgraphAdapter implements IAccountVaultsAdapter {
	private readonly sources = new Map<number, SubgraphSource>();
	private readonly builtInQuery: typeof this.queryAccountVaults;
	constructor(
		private readonly config: AccountVaultsSubgraphAdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		const uncached = this.queryAccountVaults;
		if (buildQuery) applyBuildQuery(this, buildQuery);
		if (config.resolver && !hasSubgraphQuerySource(this.queryAccountVaults)) {
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
			const first = keys[0];
			if (!first) return [];
			const chainId = first.chainId;
			const { endpoint, source } = await resolveSubgraphRead(
				chainId,
				"account-vault-discovery",
				this.config.subgraphURLs,
				this.config.resolver,
				first.withSource ? undefined : this.sources,
				first.expectedSource,
			);
			const resolver = this.config.resolver;
			const rows = endpoint
				? await querySubgraphAccounts(
						chainId,
						keys.map((key) => key.account),
						{ endpoint, ...source },
						this.config.queryOptions,
						source && resolver
							? () => resolver.resolve(chainId, "account-vault-discovery")
							: undefined,
					)
				: new Map();
			return keys.map((key) => ({
				value: {
					data: {
						trackingActiveAccount:
							rows.get(getAddressPrefix(key.account).toLowerCase()) ?? null,
					},
				},
				...(source ? { source: { ...source } } : {}),
			}));
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
			!hasSubgraphQuerySource(this.queryAccountVaults) &&
			this.config.subgraphURLs[chainId] === false
		)
			throw new SubgraphUnavailableError("disabled", chainId);
		if (
			this.queryAccountVaults !== this.builtInQuery ||
			hasSubgraphQuerySource(this.queryAccountVaults) ||
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
