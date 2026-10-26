import {
	querySubgraphFactories,
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
import type { Address } from "viem";
import type {
	IVaultTypeAdapter,
	VaultFactoryResult,
	VaultResolvedTypeResult,
} from "./IVaultTypeAdapter.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";

export interface VaultTypeSubgraphAdapterConfig {
	subgraphURLs: Record<number, string | false>;
	resolver?: SubgraphResolver;
	queryOptions?: SubgraphQueryOptions;
}

export class VaultTypeSubgraphAdapter implements IVaultTypeAdapter {
	private readonly sources = new Map<number, SubgraphSource>();
	private readonly builtInQuery: typeof this.queryVaultFactories;
	constructor(
		private readonly config: VaultTypeSubgraphAdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		const uncached = this.queryVaultFactories;
		if (buildQuery) applyBuildQuery(this, buildQuery);
		if (config.resolver && !hasSubgraphQuerySource(this.queryVaultFactories)) {
			const configured = this.queryVaultFactories;
			// Catalog reads evaluate freshness and retirement; explicit maps retain query wrappers.
			this.queryVaultFactories = (key) =>
				config.subgraphURLs[key.chainId] ? configured(key) : uncached(key);
		}
		this.builtInQuery = this.queryVaultFactories;
	}

	private readonly loadVaultFactories = createSubgraphCallBundler(
		async (
			keys: ({
				chainId: number;
				address: Address;
				withSource?: boolean;
			} & SubgraphReadOptions)[],
		): Promise<SubgraphReadResult<VaultFactoryResult | undefined>[]> => {
			const first = keys[0];
			if (!first) return [];
			const chainId = first.chainId;
			const { endpoint, source } = await resolveSubgraphRead(
				chainId,
				"vault-factory-lookup",
				this.config.subgraphURLs,
				this.config.resolver,
				first.withSource ? undefined : this.sources,
				first.expectedSource,
			);
			const resolver = this.config.resolver;
			const rows = endpoint
				? await querySubgraphFactories(
						chainId,
						keys.map((key) => key.address),
						{ endpoint, ...source },
						this.config.queryOptions,
						source && resolver
							? () => resolver.resolve(chainId, "vault-factory-lookup")
							: undefined,
					)
				: new Map();
			return keys.map((key) => ({
				value: rows.get(key.address.toLowerCase()),
				...(source ? { source: { ...source } } : {}),
			}));
		},
	);

	queryVaultFactories = async (key: {
		address: Address;
		chainId: number;
	}): Promise<VaultFactoryResult | undefined> =>
		(await this.loadVaultFactories(key)).value;

	setQueryVaultFactories(fn: typeof this.queryVaultFactories): void {
		this.queryVaultFactories = fn;
	}

	/** Keep the returned source with the baseline of a multi-read operation. */
	async fetchVaultFactoriesWithSource(
		chainId: number,
		vaultAddresses: Address[],
		options: SubgraphReadOptions = {},
	): Promise<SubgraphReadResult<VaultFactoryResult[]>> {
		if (
			this.queryVaultFactories === this.builtInQuery &&
			!hasSubgraphQuerySource(this.queryVaultFactories) &&
			this.config.subgraphURLs[chainId] === false
		)
			throw new SubgraphUnavailableError("disabled", chainId);
		if (
			this.queryVaultFactories !== this.builtInQuery ||
			hasSubgraphQuerySource(this.queryVaultFactories) ||
			this.config.subgraphURLs[chainId] ||
			!this.config.resolver
		) {
			if (options.expectedSource)
				throw new SubgraphUnavailableError("source-changed", chainId);
			return { value: await this.fetchVaultFactories(chainId, vaultAddresses) };
		}
		const expectedSource = options.expectedSource
			? { ...options.expectedSource }
			: undefined;
		if (!vaultAddresses.length) {
			const { source } = await resolveSubgraphRead(
				chainId,
				"vault-factory-lookup",
				this.config.subgraphURLs,
				this.config.resolver,
				undefined,
				expectedSource,
			);
			return { value: [], source };
		}
		const results = await Promise.all(
			vaultAddresses.map((address) =>
				this.loadVaultFactories({
					chainId,
					address,
					withSource: true,
					expectedSource,
				}),
			),
		);
		return {
			value: results
				.map((result) => result.value)
				.filter((result): result is VaultFactoryResult => result != null),
			source: results[0]?.source,
		};
	}

	async fetchVaultType(
		chainId: number,
		vaultAddress: Address,
	): Promise<string | undefined> {
		const result = await this.queryVaultFactories({
			address: vaultAddress,
			chainId,
		});
		return result?.factory;
	}

	async fetchVaultTypes(
		chainId: number,
		vaultAddresses: Address[],
	): Promise<VaultResolvedTypeResult[]> {
		if (vaultAddresses.length === 0) return [];

		const results = await Promise.all(
			vaultAddresses.map((address) =>
				this.queryVaultFactories({ address, chainId }),
			),
		);

		return results
			.filter((result): result is VaultFactoryResult => result != null)
			.map((result) => ({
				id: result.id,
				type: result.factory,
			}));
	}

	async fetchVaultFactories(
		chainId: number,
		vaultAddresses: Address[],
	): Promise<VaultFactoryResult[]> {
		if (vaultAddresses.length === 0) return [];

		if (
			this.queryVaultFactories === this.builtInQuery &&
			!hasSubgraphQuerySource(this.queryVaultFactories) &&
			!this.config.resolver &&
			!this.config.subgraphURLs[chainId] &&
			this.config.subgraphURLs[chainId] !== false
		) {
			throw new Error(`Subgraph URL not found for chain ${chainId}`);
		}

		const results = await Promise.all(
			vaultAddresses.map((address) =>
				this.queryVaultFactories({ address, chainId }),
			),
		);

		return results.filter((r): r is VaultFactoryResult => r != null);
	}
}
