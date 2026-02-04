import { Address, getAddress } from "viem";
import type {
  IVaultTypeDataSource,
  VaultFactoryResult,
} from "./IVaultTypeDataSource.js";

export interface VaultTypeSubgraphDataSourceConfig {
  subgraphURLs: Record<number, string>;
}

const PAGE_SIZE = 100;

export class VaultTypeSubgraphDataSource implements IVaultTypeDataSource {
  constructor(
    private readonly config: VaultTypeSubgraphDataSourceConfig
  ) {}

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
      vaults(where: { id_in: $ids }) {
        id
        factory
      }
    }`;

    const pagePromises = [];
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const pageIds = ids.slice(i, i + PAGE_SIZE);
      pagePromises.push(
        fetch(subgraphUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            variables: { ids: pageIds },
          }),
        }).then(async (response) => {
          const json = (await response.json()) as {
            data?: { vaults?: Array<{ id: string; factory: string }> };
          };
          const vaults = json.data?.vaults ?? [];
          return vaults.map((v) => ({
            id: getAddress(v.id),
            factory: getAddress(v.factory),
          }));
        })
      );
    }
    const pageResults = await Promise.all(pagePromises);
    return pageResults.flat();
  }
}
