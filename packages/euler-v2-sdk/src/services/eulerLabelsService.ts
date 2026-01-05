import { EulerLabelEntity, EulerLabelVault, EulerLabelProduct } from "src/entities/EulerLabels.js";
import { Address } from "src/entities/EVault.js";

export interface IEulerLabelsDataSource {
  getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>>;
  getEulerLabelsEntities(chainId: number): Promise<Record<Address, EulerLabelEntity>>;
  getEulerLabelsProducts(chainId: number): Promise<Record<Address, EulerLabelProduct>>;
}

export class EulerLabelsService {
    constructor(
      private readonly dataSource: IEulerLabelsDataSource
    ) {}

    async getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>> {
        return this.dataSource.getEulerLabelsVaults(chainId);
    }
    async getEulerLabelsEntities(chainId: number): Promise<Record<Address, EulerLabelEntity>> {
        return this.dataSource.getEulerLabelsEntities(chainId);
    }
    async getEulerLabelsProducts(chainId: number): Promise<Record<Address, EulerLabelProduct>> {
        return this.dataSource.getEulerLabelsProducts(chainId);
    }
} 

export interface EulerLabelsURLDataSourceConfig {
  getEulerLabelsVaultsUrl: (chainId: number) => string;
  getEulerLabelsEntitiesUrl: (chainId: number) => string;
  getEulerLabelsProductsUrl: (chainId: number) => string;
  getEulerLabelsEarnVaultsUrl: (chainId: number) => string;
}
export class EulerLabelsURLDataSource implements IEulerLabelsDataSource {
  constructor(
    private readonly config: EulerLabelsURLDataSourceConfig
  ) {}

  async getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>> {
    const response = await fetch(this.config.getEulerLabelsVaultsUrl(chainId))
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels vaults for chain ${chainId}: ${response.statusText}`);
    }
    const data = await response.json() as Promise<Record<Address, EulerLabelVault>>;
    return data;
  }
  async getEulerLabelsEntities(chainId: number): Promise<Record<Address, EulerLabelEntity>> {
    const response = await fetch(this.config.getEulerLabelsEntitiesUrl(chainId))
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels entities for chain ${chainId}: ${response.statusText}`);
    }
    const data = await response.json() as Promise<Record<Address, EulerLabelEntity>>;
    return data;
  }
  async getEulerLabelsProducts(chainId: number): Promise<Record<Address, EulerLabelProduct>> {
    const response = await fetch(this.config.getEulerLabelsProductsUrl(chainId))
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels products for chain ${chainId}: ${response.statusText}`);
    }
    const data = await response.json() as Promise<Record<Address, EulerLabelProduct>>;
    return data;
  }
}
