import type {
	EulerLabelEntity,
	EulerLabelVault,
	EulerLabelProduct,
	EulerLabelPoint,
} from "../../entities/EulerLabels.js";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type { Address } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

export interface IEulerLabelsAdapter {
	fetchEulerLabelsVaults(
		chainId: number,
	): Promise<Record<Address, EulerLabelVault>>;
	fetchEulerLabelsEntities(
		chainId: number,
	): Promise<Record<string, EulerLabelEntity>>;
	fetchEulerLabelsProducts(
		chainId: number,
	): Promise<Record<string, EulerLabelProduct>>;
	fetchEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]>;
}

export interface IEulerLabelsService {
	fetchEulerLabelsVaults(
		chainId: number,
	): Promise<Record<Address, EulerLabelVault>>;
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

	async fetchEulerLabelsVaults(
		chainId: number,
	): Promise<Record<Address, EulerLabelVault>> {
		return this.adapter.fetchEulerLabelsVaults(chainId);
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

		const [labelsVaults, labelsEntities, labelsProducts, labelsPoints] =
			await Promise.all([
				this.fetchEulerLabelsVaults(chainId).catch(
					() => ({}) as Record<Address, EulerLabelVault>,
				),
				this.fetchEulerLabelsEntities(chainId).catch(
					() => ({}) as Record<string, EulerLabelEntity>,
				),
				this.fetchEulerLabelsProducts(chainId).catch(
					() => ({}) as Record<string, EulerLabelProduct>,
				),
				this.fetchEulerLabelsPoints(chainId).catch(
					() => [] as EulerLabelPoint[],
				),
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
			const vaultLabel = labelsVaultsLower.get(addrLower);
			if (!vaultLabel) {
				vault.populated.labels = true;
				continue;
			}

			// Resolve entities from the vault's entity field
			const entitySlugs = Array.isArray(vaultLabel.entity)
				? vaultLabel.entity
				: vaultLabel.entity
					? [vaultLabel.entity]
					: [];
			const entities = entitySlugs
				.map((slug) => labelsEntities[slug])
				.filter((e): e is EulerLabelEntity => !!e)
				.map((e) => ({
					...e,
					logo: e.logo ? this.resolveLogoUrl(e.logo) : e.logo,
				}));

			// Find matching products
			const products = (productsByVault.get(addrLower) ?? []).map((p) => ({
				...p,
				logo: p.logo ? this.resolveLogoUrl(p.logo) : undefined,
			}));

			// Find matching points (collateralVaults only)
			const points = (pointsByCollateralVault.get(addrLower) ?? []).map(
				(p) => ({
					...p,
					logo: p.logo ? this.resolveLogoUrl(p.logo) : p.logo,
				}),
			);

			const deprecationReason = deprecatedVaultsMap.get(addrLower);

			vault.eulerLabel = {
				vault: vaultLabel,
				entities,
				products,
				points,
				...(deprecationReason !== undefined && {
					deprecated: true,
					deprecationReason,
				}),
			};
			vault.populated.labels = true;
		}
	}
}

export interface EulerLabelsURLAdapterConfig {
	getEulerLabelsVaultsUrl: (chainId: number) => string;
	getEulerLabelsEntitiesUrl: (chainId: number) => string;
	getEulerLabelsProductsUrl: (chainId: number) => string;
	getEulerLabelsPointsUrl: (chainId: number) => string;
	getEulerLabelsEarnVaultsUrl: (chainId: number) => string;
	getEulerLabelsLogoUrl: (filename: string) => string;
}
export class EulerLabelsURLAdapter implements IEulerLabelsAdapter {
	constructor(
		private readonly config: EulerLabelsURLAdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	queryEulerLabelsVaults = async (
		url: string,
	): Promise<Record<Address, EulerLabelVault>> => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch Euler labels vaults: ${response.statusText}`,
			);
		}
		return response.json() as Promise<Record<Address, EulerLabelVault>>;
	};

	setQueryEulerLabelsVaults(fn: typeof this.queryEulerLabelsVaults): void {
		this.queryEulerLabelsVaults = fn;
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

	async fetchEulerLabelsVaults(
		chainId: number,
	): Promise<Record<Address, EulerLabelVault>> {
		return this.queryEulerLabelsVaults(
			this.config.getEulerLabelsVaultsUrl(chainId),
		);
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
