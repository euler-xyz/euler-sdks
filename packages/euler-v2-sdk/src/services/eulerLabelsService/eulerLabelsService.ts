import { EulerLabelEntity, EulerLabelVault, EulerLabelProduct } from "../../entities/EulerLabels.js";
import { Address } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

export interface IEulerLabelsDataSource {
  getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>>;
  getEulerLabelsEntities(chainId: number): Promise<Record<Address, EulerLabelEntity>>;
  getEulerLabelsProducts(chainId: number): Promise<Record<Address, EulerLabelProduct>>;
}

export interface IEulerLabelsService {
  getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>>;
  getEulerLabelsEntities(chainId: number): Promise<Record<Address, EulerLabelEntity>>;
  getEulerLabelsProducts(chainId: number): Promise<Record<Address, EulerLabelProduct>>;
}

export class EulerLabelsService implements IEulerLabelsService {
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
    private readonly config: EulerLabelsURLDataSourceConfig,
    buildQuery?: BuildQueryFn,
  ) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  queryEulerLabelsVaults = async (url: string): Promise<Record<Address, EulerLabelVault>> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels vaults: ${response.statusText}`);
    }
    return response.json() as Promise<Record<Address, EulerLabelVault>>;
  };

  setQueryEulerLabelsVaults(fn: typeof this.queryEulerLabelsVaults): void {
    this.queryEulerLabelsVaults = fn;
  }

  queryEulerLabelsEntities = async (url: string): Promise<Record<Address, EulerLabelEntity>> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels entities: ${response.statusText}`);
    }
    return response.json() as Promise<Record<Address, EulerLabelEntity>>;
  };

  setQueryEulerLabelsEntities(fn: typeof this.queryEulerLabelsEntities): void {
    this.queryEulerLabelsEntities = fn;
  }

  queryEulerLabelsProducts = async (url: string): Promise<Record<Address, EulerLabelProduct>> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels products: ${response.statusText}`);
    }
    return response.json() as Promise<Record<Address, EulerLabelProduct>>;
  };

  setQueryEulerLabelsProducts(fn: typeof this.queryEulerLabelsProducts): void {
    this.queryEulerLabelsProducts = fn;
  }

  async getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>> {
    return this.queryEulerLabelsVaults(this.config.getEulerLabelsVaultsUrl(chainId));
  }
  async getEulerLabelsEntities(chainId: number): Promise<Record<Address, EulerLabelEntity>> {
    return this.queryEulerLabelsEntities(this.config.getEulerLabelsEntitiesUrl(chainId));
  }
  async getEulerLabelsProducts(chainId: number): Promise<Record<Address, EulerLabelProduct>> {
    return this.queryEulerLabelsProducts(this.config.getEulerLabelsProductsUrl(chainId));
  }
}
