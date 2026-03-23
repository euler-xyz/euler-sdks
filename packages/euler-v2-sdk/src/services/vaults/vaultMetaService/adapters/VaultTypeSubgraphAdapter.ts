import { type Address, getAddress } from "viem";
import type {
	IVaultTypeAdapter,
	VaultFactoryResult,
} from "./IVaultTypeAdapter.js";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import { createCallBundler } from "../../../../utils/callBundler.js";

export interface VaultTypeSubgraphAdapterConfig {
	subgraphURLs: Record<number, string>;
}

const PAGE_SIZE = 1000;

export class VaultTypeSubgraphAdapter implements IVaultTypeAdapter {
	constructor(
		private readonly config: VaultTypeSubgraphAdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	queryVaultFactories = createCallBundler(
		async (
			keys: { address: Address; chainId: number }[],
		): Promise<(VaultFactoryResult | undefined)[]> => {
      console.time("VaultTypeSubgraphAdapter.queryVaultFactories");
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const arr = byChain.get(key.chainId) ?? [];
				arr.push(key.address);
				byChain.set(key.chainId, arr);
			}

			const chainResults = new Map<number, Map<string, Address>>();
			for (const [chainId, addresses] of byChain) {
				const subgraphUrl = this.config.subgraphURLs[chainId];
				if (!subgraphUrl) continue;

				const ids = [...new Set(addresses.map((a) => a.toLowerCase()))];
				const query = `query VaultFactories($ids: [String!]!) {
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
					const json = (await response.json()) as {
						data?: { vaults?: Array<{ id: string; factory: string }> };
					};
					for (const v of json.data?.vaults ?? []) {
						map.set(v.id.toLowerCase(), getAddress(v.factory));
					}
				}

				chainResults.set(chainId, map);
			}
      console.timeEnd("VaultTypeSubgraphAdapter.queryVaultFactories");
			return keys.map((key) => {
				const factory = chainResults
					.get(key.chainId)
					?.get(key.address.toLowerCase());
				return factory ? { id: getAddress(key.address), factory } : undefined;
			});
		},
	);

	setQueryVaultFactories(fn: typeof this.queryVaultFactories): void {
		this.queryVaultFactories = fn;
	}

	async fetchVaultFactories(
		chainId: number,
		vaultAddresses: Address[],
	): Promise<VaultFactoryResult[]> {
		if (vaultAddresses.length === 0) return [];

		const subgraphUrl = this.config.subgraphURLs[chainId];
		if (!subgraphUrl) {
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
