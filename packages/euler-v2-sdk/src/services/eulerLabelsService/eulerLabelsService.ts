import type {
  EulerLabelEntity,
  EulerLabelProduct,
  EulerLabelPoint,
} from "../../entities/EulerLabels.js";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

export interface IEulerLabelsAdapter {
  fetchEulerLabelsEntities(
    chainId: number,
  ): Promise<Record<string, EulerLabelEntity>>;
  fetchEulerLabelsProducts(
    chainId: number,
  ): Promise<Record<string, EulerLabelProduct>>;
  fetchEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]>;
}

export interface IEulerLabelsService {
  fetchEulerLabelsEntities(
    chainId: number,
  ): Promise<Record<string, EulerLabelEntity>>;
  fetchEulerLabelsProducts(
    chainId: number,
  ): Promise<Record<string, EulerLabelProduct>>;
  fetchEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]>;
  resolveLogoUrl(filename: string): string;
  populateLabels(vaults: ERC4626Vault[]): Promise<void>;
}

export class EulerLabelsService implements IEulerLabelsService {
  constructor(
    private adapter: IEulerLabelsAdapter,
    private resolveLogoUrlFn?: (filename: string) => string,
  ) {}

  setAdapter(adapter: IEulerLabelsAdapter): void {
    this.adapter = adapter;
  }

  resolveLogoUrl(filename: string): string {
    return this.resolveLogoUrlFn ? this.resolveLogoUrlFn(filename) : filename;
  }

  async fetchEulerLabelsEntities(
    chainId: number,
  ): Promise<Record<string, EulerLabelEntity>> {
    return this.adapter.fetchEulerLabelsEntities(chainId);
  }
  async fetchEulerLabelsProducts(
    chainId: number,
  ): Promise<Record<string, EulerLabelProduct>> {
    return this.adapter.fetchEulerLabelsProducts(chainId);
  }
  async fetchEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]> {
    return this.adapter.fetchEulerLabelsPoints(chainId);
  }

  async populateLabels(vaults: ERC4626Vault[]): Promise<void> {
    if (vaults.length === 0) return;

    const chainId = vaults[0]!.chainId;

    const [labelsEntities, labelsProducts, labelsPoints] = await Promise.all([
      this.fetchEulerLabelsEntities(chainId).catch(
        () => ({}) as Record<string, EulerLabelEntity>,
      ),
      this.fetchEulerLabelsProducts(chainId).catch(
        () => ({}) as Record<string, EulerLabelProduct>,
      ),
      this.fetchEulerLabelsPoints(chainId).catch(() => [] as EulerLabelPoint[]),
    ]);

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

    // Pre-index deprecated vaults: address -> deprecationReason
    const deprecatedVaultsMap = new Map<string, string>();
    for (const product of Object.values(labelsProducts)) {
      if (!product.deprecatedVaults) continue;
      for (const vaultAddr of product.deprecatedVaults) {
        deprecatedVaultsMap.set(
          vaultAddr.toLowerCase(),
          product.deprecationReason ?? "",
        );
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

      // Resolve products this vault belongs to (with logos)
      const products = (productsByVault.get(addrLower) ?? []).map((p) => ({
        ...p,
        logo: p.logo ? this.resolveLogoUrl(p.logo) : undefined,
      }));

      // Derive curator entities from the vault's products. The product `entity`
      // field is sometimes a bare string and sometimes an array — normalize to
      // an array. Dedupe by slug while preserving first-seen order so the
      // primary curator stays first.
      const seenEntitySlugs = new Set<string>();
      const entities: EulerLabelEntity[] = [];
      for (const product of products) {
        if (!product.entity) continue;
        const slugs = Array.isArray(product.entity)
          ? product.entity
          : [product.entity];
        for (const slug of slugs) {
          if (seenEntitySlugs.has(slug)) continue;
          seenEntitySlugs.add(slug);
          const entity = labelsEntities[slug];
          if (!entity) continue;
          entities.push({
            ...entity,
            logo: entity.logo ? this.resolveLogoUrl(entity.logo) : entity.logo,
          });
        }
      }

      // Resolve points where this vault is a collateral vault (with logos)
      const points = (pointsByCollateralVault.get(addrLower) ?? []).map(
        (p) => ({
          ...p,
          logo: p.logo ? this.resolveLogoUrl(p.logo) : p.logo,
        }),
      );

      const deprecationReason = deprecatedVaultsMap.get(addrLower);

      const hasAnyLabel =
        products.length > 0 ||
        entities.length > 0 ||
        points.length > 0 ||
        deprecationReason !== undefined;

      if (hasAnyLabel) {
        vault.eulerLabel = {
          entities,
          products,
          points,
          ...(deprecationReason !== undefined && {
            deprecated: true,
            deprecationReason,
          }),
        };
      }

      vault.populated.labels = true;
    }
  }
}

export interface EulerLabelsURLAdapterConfig {
  getEulerLabelsEntitiesUrl: (chainId: number) => string;
  getEulerLabelsProductsUrl: (chainId: number) => string;
  getEulerLabelsPointsUrl: (chainId: number) => string;
  getEulerLabelsLogoUrl: (filename: string) => string;
}
export class EulerLabelsURLAdapter implements IEulerLabelsAdapter {
  constructor(
    private readonly config: EulerLabelsURLAdapterConfig,
    buildQuery?: BuildQueryFn,
  ) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  queryEulerLabelsEntities = async (
    url: string,
  ): Promise<Record<string, EulerLabelEntity>> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Euler labels entities: ${response.statusText}`,
      );
    }
    return response.json() as Promise<Record<string, EulerLabelEntity>>;
  };

  setQueryEulerLabelsEntities(fn: typeof this.queryEulerLabelsEntities): void {
    this.queryEulerLabelsEntities = fn;
  }

  queryEulerLabelsProducts = async (
    url: string,
  ): Promise<Record<string, EulerLabelProduct>> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Euler labels products: ${response.statusText}`,
      );
    }
    return response.json() as Promise<Record<string, EulerLabelProduct>>;
  };

  setQueryEulerLabelsProducts(fn: typeof this.queryEulerLabelsProducts): void {
    this.queryEulerLabelsProducts = fn;
  }

  queryEulerLabelsPoints = async (url: string): Promise<EulerLabelPoint[]> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Euler labels points: ${response.statusText}`,
      );
    }
    return response.json() as Promise<EulerLabelPoint[]>;
  };

  setQueryEulerLabelsPoints(fn: typeof this.queryEulerLabelsPoints): void {
    this.queryEulerLabelsPoints = fn;
  }

  async fetchEulerLabelsEntities(
    chainId: number,
  ): Promise<Record<string, EulerLabelEntity>> {
    return this.queryEulerLabelsEntities(
      this.config.getEulerLabelsEntitiesUrl(chainId),
    );
  }
  async fetchEulerLabelsProducts(
    chainId: number,
  ): Promise<Record<string, EulerLabelProduct>> {
    return this.queryEulerLabelsProducts(
      this.config.getEulerLabelsProductsUrl(chainId),
    );
  }
  async fetchEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]> {
    return this.queryEulerLabelsPoints(
      this.config.getEulerLabelsPointsUrl(chainId),
    );
  }
}
