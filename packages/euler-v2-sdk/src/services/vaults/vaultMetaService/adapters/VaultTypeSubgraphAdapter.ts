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
}

const PAGE_SIZE = 1000;

export class VaultTypeSubgraphAdapter implements IVaultTypeAdapter {
	private readonly sources = new Map<number, SubgraphSource>();
	private readonly builtInQuery: typeof this.queryVaultFactories;
	constructor(
		private readonly config: VaultTypeSubgraphAdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		const uncached = this.queryVaultFactories;
		if (buildQuery) applyBuildQuery(this, buildQuery);
		if (config.resolver) {
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
				address: Address;
				chainId: number;
				withSource?: boolean;
			} & SubgraphReadOptions)[],
		): Promise<SubgraphReadResult<VaultFactoryResult | undefined>[]> => {
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const arr = byChain.get(key.chainId) ?? [];
				arr.push(key.address);
				byChain.set(key.chainId, arr);
			}

			const chainResults = new Map<number, Map<string, Address>>();
			let readSource: SubgraphSource | undefined;
			for (const [chainId, addresses] of byChain) {
				const { endpoint: subgraphUrl, source } = await resolveSubgraphRead(
					chainId,
					"vault-factory-lookup",
					this.config.subgraphURLs,
					this.config.resolver,
					keys[0]?.withSource ? undefined : this.sources,
					keys[0]?.expectedSource,
				);
				if (!subgraphUrl) continue;
				readSource = source;

				const ids = [...new Set(addresses.map((a) => a.toLowerCase()))];
				const query = `query VaultFactories($ids: [String!]!) {
      ${source ? "_meta { deployment }" : ""}
      vaults(first: ${PAGE_SIZE}, where: { id_in: $ids }) {
        id
        factory
      }
    }`;

				const map = new Map<string, Address>();
				for (let i = 0; i < ids.length; i += PAGE_SIZE) {
					const pageIds = ids.slice(i, i + PAGE_SIZE);
					const response = await fetch(subgraphUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ query, variables: { ids: pageIds } }),
					});
					if (!response.ok) {
						throw new Error(
							`Vault type subgraph ${response.status} ${response.statusText}`,
						);
					}
					const json = (await response.json()) as {
						data?: { vaults?: Array<{ id: string; factory: string }> };
						errors?: unknown[];
					};
					if (json?.errors?.length) {
						throw new Error("Vault type subgraph returned GraphQL errors.");
					}
					validateSubgraphDeployment(json, chainId, source);
					if (!Array.isArray(json?.data?.vaults)) {
						throw new Error(
							"Vault type subgraph returned malformed vault data.",
						);
					}
					for (const v of json.data.vaults) {
						map.set(v.id.toLowerCase(), getAddress(v.factory));
					}
				}
				chainResults.set(chainId, map);
			}
			return keys.map((key) => {
				const factory = chainResults
					.get(key.chainId)
					?.get(key.address.toLowerCase());
				return {
					value: factory ? { id: getAddress(key.address), factory } : undefined,
					...(readSource ? { source: { ...readSource } } : {}),
				};
			});
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
			this.config.subgraphURLs[chainId] === false
		)
			throw new SubgraphUnavailableError("disabled", chainId);
		if (
			this.queryVaultFactories !== this.builtInQuery ||
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
