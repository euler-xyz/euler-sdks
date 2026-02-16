import { EulerLabelEntity, EulerLabelVault, EulerLabelProduct, EulerLabelPoint } from "../../entities/EulerLabels.js";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import { Address } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

export interface IEulerLabelsDataSource {
  getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>>;
  getEulerLabelsEntities(chainId: number): Promise<Record<string, EulerLabelEntity>>;
  getEulerLabelsProducts(chainId: number): Promise<Record<string, EulerLabelProduct>>;
  getEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]>;
}

export interface IEulerLabelsService {
  getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>>;
  getEulerLabelsEntities(chainId: number): Promise<Record<string, EulerLabelEntity>>;
  getEulerLabelsProducts(chainId: number): Promise<Record<string, EulerLabelProduct>>;
  getEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]>;
  resolveLogoUrl(filename: string): string;
  populateLabels(vaults: ERC4626Vault[]): Promise<void>;
}

export class EulerLabelsService implements IEulerLabelsService {
    constructor(
      private dataSource: IEulerLabelsDataSource,
      private resolveLogoUrlFn?: (filename: string) => string,
    ) {}

    setDataSource(dataSource: IEulerLabelsDataSource): void {
      this.dataSource = dataSource;
    }

    resolveLogoUrl(filename: string): string {
      return this.resolveLogoUrlFn ? this.resolveLogoUrlFn(filename) : filename;
    }

    async getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>> {
        return this.dataSource.getEulerLabelsVaults(chainId);
    }
    async getEulerLabelsEntities(chainId: number): Promise<Record<string, EulerLabelEntity>> {
        return this.dataSource.getEulerLabelsEntities(chainId);
    }
    async getEulerLabelsProducts(chainId: number): Promise<Record<string, EulerLabelProduct>> {
        return this.dataSource.getEulerLabelsProducts(chainId);
    }
    async getEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]> {
        return this.dataSource.getEulerLabelsPoints(chainId);
    }

    async populateLabels(vaults: ERC4626Vault[]): Promise<void> {
      if (vaults.length === 0) return;

      const chainId = vaults[0]!.chainId;

      const [labelsVaults, labelsEntities, labelsProducts, labelsPoints] = await Promise.all([
        this.getEulerLabelsVaults(chainId).catch(() => ({} as Record<Address, EulerLabelVault>)),
        this.getEulerLabelsEntities(chainId).catch(() => ({} as Record<string, EulerLabelEntity>)),
        this.getEulerLabelsProducts(chainId).catch(() => ({} as Record<string, EulerLabelProduct>)),
        this.getEulerLabelsPoints(chainId).catch(() => [] as EulerLabelPoint[]),
      ]);

      // Build a lowercase address -> vault label lookup
      const labelsVaultsLower = new Map<string, EulerLabelVault>();
      for (const [addr, label] of Object.entries(labelsVaults)) {
        labelsVaultsLower.set(addr.toLowerCase(), label);
      }

      // Pre-index products by lowercase vault address for efficient lookup
      const productsByVault = new Map<string, EulerLabelProduct[]>();
      for (const product of Object.values(labelsProducts)) {
        for (const vaultAddr of product.vaults) {
          const key = vaultAddr.toLowerCase();
          const list = productsByVault.get(key) ?? [];
          list.push(product);
          productsByVault.set(key, list);
        }
      }

      // Pre-index points by lowercase collateral vault address
      const pointsByCollateralVault = new Map<string, EulerLabelPoint[]>();
      for (const point of labelsPoints) {
        if (!point.collateralVaults) continue;
        for (const vaultAddr of point.collateralVaults) {
          const key = vaultAddr.toLowerCase();
          const list = pointsByCollateralVault.get(key) ?? [];
          list.push(point);
          pointsByCollateralVault.set(key, list);
        }
      }

      for (const vault of vaults) {
        const addrLower = vault.address.toLowerCase();
        const vaultLabel = labelsVaultsLower.get(addrLower);
        if (!vaultLabel) continue;

        // Resolve entities from the vault's entity field
        const entitySlugs = Array.isArray(vaultLabel.entity)
          ? vaultLabel.entity
          : vaultLabel.entity ? [vaultLabel.entity] : [];
        const entities = entitySlugs
          .map(slug => labelsEntities[slug])
          .filter((e): e is EulerLabelEntity => !!e)
          .map(e => ({
            ...e,
            logo: e.logo ? this.resolveLogoUrl(e.logo) : e.logo,
          }));

        // Find matching products
        const products = (productsByVault.get(addrLower) ?? [])
          .map(p => ({
            ...p,
            logo: p.logo ? this.resolveLogoUrl(p.logo) : undefined,
          }));

        // Find matching points (collateralVaults only)
        const points = (pointsByCollateralVault.get(addrLower) ?? [])
          .map(p => ({
            ...p,
            logo: p.logo ? this.resolveLogoUrl(p.logo) : p.logo,
          }));

        vault.eulerLabel = {
          vault: vaultLabel,
          entities,
          products,
          points,
        };
      }
    }
}

export interface EulerLabelsURLDataSourceConfig {
  getEulerLabelsVaultsUrl: (chainId: number) => string;
  getEulerLabelsEntitiesUrl: (chainId: number) => string;
  getEulerLabelsProductsUrl: (chainId: number) => string;
  getEulerLabelsPointsUrl: (chainId: number) => string;
  getEulerLabelsEarnVaultsUrl: (chainId: number) => string;
  getEulerLabelsLogoUrl: (filename: string) => string;
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

  queryEulerLabelsEntities = async (url: string): Promise<Record<string, EulerLabelEntity>> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels entities: ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, EulerLabelEntity>>;
  };

  setQueryEulerLabelsEntities(fn: typeof this.queryEulerLabelsEntities): void {
    this.queryEulerLabelsEntities = fn;
  }

  queryEulerLabelsProducts = async (url: string): Promise<Record<string, EulerLabelProduct>> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels products: ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, EulerLabelProduct>>;
  };

  setQueryEulerLabelsProducts(fn: typeof this.queryEulerLabelsProducts): void {
    this.queryEulerLabelsProducts = fn;
  }

  queryEulerLabelsPoints = async (url: string): Promise<EulerLabelPoint[]> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Euler labels points: ${response.statusText}`);
    }
    return response.json() as Promise<EulerLabelPoint[]>;
  };

  setQueryEulerLabelsPoints(fn: typeof this.queryEulerLabelsPoints): void {
    this.queryEulerLabelsPoints = fn;
  }

  async getEulerLabelsVaults(chainId: number): Promise<Record<Address, EulerLabelVault>> {
    return this.queryEulerLabelsVaults(this.config.getEulerLabelsVaultsUrl(chainId));
  }
  async getEulerLabelsEntities(chainId: number): Promise<Record<string, EulerLabelEntity>> {
    return this.queryEulerLabelsEntities(this.config.getEulerLabelsEntitiesUrl(chainId));
  }
  async getEulerLabelsProducts(chainId: number): Promise<Record<string, EulerLabelProduct>> {
    return this.queryEulerLabelsProducts(this.config.getEulerLabelsProductsUrl(chainId));
  }
  async getEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]> {
    return this.queryEulerLabelsPoints(this.config.getEulerLabelsPointsUrl(chainId));
  }
}
