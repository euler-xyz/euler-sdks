import { Address, getAddress } from "viem";
import type {
  IVaultTypeAdapter,
  VaultFactoryResult,
} from "./IVaultTypeAdapter.js";
import { type BuildQueryFn, applyBuildQuery } from "../../../../utils/buildQuery.js";

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

  queryVaultFactories = async (
    subgraphUrl: string,
    query: string,
    pageIds: string[]
  ): Promise<Array<{ id: string; factory: string }>> => {
    const response = await fetch(subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { ids: pageIds },
      }),
    });
    const json = (await response.json()) as {
      data?: { vaults?: Array<{ id: string; factory: string }> };
    };
    return json.data?.vaults ?? [];
  };

  setQueryVaultFactories(fn: typeof this.queryVaultFactories): void {
    this.queryVaultFactories = fn;
  }

  async getVaultFactories(
    chainId: number,
    vaultAddresses: Address[]
  ): Promise<VaultFactoryResult[]> {
    if (vaultAddresses.length === 0) {
      return [];
    }
    const subgraphUrl = this.config.subgraphURLs[chainId];
    if (!subgraphUrl) {
      throw new Error(`Subgraph URL not found for chain ${chainId}`);
    }
    const ids = vaultAddresses.map((a) => a.toLowerCase());
    const query = `query VaultFactories($ids: [String!]!) {
      vaults(first: ${PAGE_SIZE}, where: { id_in: $ids }) {
        id
        factory
      }
    }`;

    const pagePromises = [];
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const pageIds = ids.slice(i, i + PAGE_SIZE);
      pagePromises.push(
        this.queryVaultFactories(subgraphUrl, query, pageIds).then((vaults) =>
          vaults.map((v) => ({
            id: getAddress(v.id),
            factory: getAddress(v.factory),
          }))
        )
      );
    }
    const pageResults = await Promise.all(pagePromises);
    return pageResults.flat();
  }
}
