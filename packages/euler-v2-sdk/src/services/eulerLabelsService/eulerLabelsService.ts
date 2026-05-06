import type {
	EulerLabelAssetEntry,
	EulerLabelAssetPatternRule,
	EulerLabelEarnVaultEntry,
	EulerLabelEntity,
	EulerLabelsData,
	EulerLabelProduct,
	EulerLabelPoint,
	EulerLabelVaultOverride,
} from "../../entities/EulerLabels.js";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
import { getAddress } from "viem";

export interface IEulerLabelsAdapter {
	fetchEulerLabelsEntities(
		chainId: number,
	): Promise<Record<string, EulerLabelEntity>>;
	fetchEulerLabelsProducts(
		chainId: number,
	): Promise<Record<string, EulerLabelProduct>>;
	fetchEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]>;
	fetchEulerLabelsEarnVaults?(
		chainId: number,
	): Promise<Array<string | EulerLabelEarnVaultEntry>>;
	fetchEulerLabelsAssets?(chainId: number): Promise<EulerLabelAssetEntry[]>;
}

export interface IEulerLabelsService {
	fetchEulerLabelsEntities(
		chainId: number,
	): Promise<Record<string, EulerLabelEntity>>;
	fetchEulerLabelsProducts(
		chainId: number,
	): Promise<Record<string, EulerLabelProduct>>;
	fetchEulerLabelsPoints(chainId: number): Promise<EulerLabelPoint[]>;
	fetchEulerLabelsEarnVaults(
		chainId: number,
	): Promise<Array<string | EulerLabelEarnVaultEntry>>;
	fetchEulerLabelsAssets(chainId: number): Promise<EulerLabelAssetEntry[]>;
	fetchEulerLabelsData(chainId: number): Promise<EulerLabelsData>;
	resolveLogoUrl(filename: string): string;
	populateLabels(vaults: ERC4626Vault[]): Promise<void>;
}

const EMPTY_LABELS_DATA: EulerLabelsData = {
	products: {},
	entities: {},
	points: {},
	verifiedVaultAddresses: [],
	earnVaults: [],
	earnVaultEntries: {},
	earnVaultBlocks: {},
	earnVaultRestrictions: {},
	featuredEarnVaults: new Set(),
	deprecatedEarnVaults: {},
	earnVaultDescriptions: {},
	earnVaultNotices: {},
	notExplorableEarnVaults: new Set(),
	assetBlocks: {},
	assetRestrictions: {},
	assetPatternRules: [],
};

const isHttpUrl = (value: string): boolean => {
	if (!value) return false;
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
};

const normalizeAddressOrThrow = (address: string): string =>
	getAddress(address);

const tryNormalizeAddress = (address: unknown): string | undefined => {
	if (typeof address !== "string") return undefined;
	try {
		return normalizeAddressOrThrow(address);
	} catch {
		return undefined;
	}
};

const filterStringArray = (value: unknown): string[] | undefined => {
	if (!Array.isArray(value)) return undefined;
	const filtered = value.filter((v): v is string => typeof v === "string");
	return filtered.length > 0 ? filtered : undefined;
};

const extractVaultOverrides = (
	raw: Record<string, unknown>,
): Record<string, EulerLabelVaultOverride> => {
	const overrides: Record<string, EulerLabelVaultOverride> = {};
	const rawOverrides = raw.vaultOverrides;
	if (!rawOverrides || typeof rawOverrides !== "object") return overrides;

	for (const [key, value] of Object.entries(
		rawOverrides as Record<string, unknown>,
	)) {
		const normalizedKey = tryNormalizeAddress(key);
		if (!normalizedKey || typeof value !== "object" || value === null) continue;
		const entry = value as Record<string, unknown>;
		const override: EulerLabelVaultOverride = {};
		if (typeof entry.name === "string") override.name = entry.name;
		if (typeof entry.description === "string")
			override.description = entry.description;
		if (typeof entry.portfolioNotice === "string")
			override.portfolioNotice = entry.portfolioNotice;
		const reason = entry.deprecationReason ?? entry.deprecateReason;
		if (typeof reason === "string") override.deprecationReason = reason;
		const block = filterStringArray(entry.block);
		if (block) override.block = block;
		const restricted = filterStringArray(entry.restricted);
		if (restricted) override.restricted = restricted;
		if (typeof entry.notExplorableLend === "boolean")
			override.notExplorableLend = entry.notExplorableLend;
		if (typeof entry.notExplorableBorrow === "boolean")
			override.notExplorableBorrow = entry.notExplorableBorrow;
		if (typeof entry.keyring === "boolean") override.keyring = entry.keyring;
		if (Object.keys(override).length > 0) {
			overrides[normalizedKey] = override;
		}
	}

	return overrides;
};

const normalizeProducts = (
	data: Record<string, EulerLabelProduct>,
): {
	products: Record<string, EulerLabelProduct>;
	vaultAddresses: string[];
} => {
	const products: Record<string, EulerLabelProduct> = {};
	const allVaults = new Set<string>();

	for (const [key, product] of Object.entries(data ?? {})) {
		const normalizedVaults = (
			Array.isArray(product.vaults) ? product.vaults : []
		)
			.map(tryNormalizeAddress)
			.filter((v): v is string => v !== undefined);
		const normalizedDeprecated = (
			Array.isArray(product.deprecatedVaults) ? product.deprecatedVaults : []
		)
			.map(tryNormalizeAddress)
			.filter((v): v is string => v !== undefined);
		const normalizedFeatured = (
			Array.isArray(product.featuredVaults) ? product.featuredVaults : []
		)
			.map(tryNormalizeAddress)
			.filter((v): v is string => v !== undefined);
		const raw = product as unknown as Record<string, unknown>;
		const fallbackReason =
			typeof raw.deprecateReason === "string" ? raw.deprecateReason : undefined;

		products[key] = {
			...product,
			vaults: normalizedVaults,
			deprecatedVaults: normalizedDeprecated,
			featuredVaults: normalizedFeatured,
			deprecationReason: product.deprecationReason || fallbackReason,
			vaultOverrides: extractVaultOverrides(raw),
		};
		normalizedVaults.forEach((v) => allVaults.add(v));
		normalizedDeprecated.forEach((v) => allVaults.add(v));
	}

	return { products, vaultAddresses: [...allVaults] };
};

const normalizeEntities = (
	data: Record<string, EulerLabelEntity>,
): Record<string, EulerLabelEntity> => {
	const entities: Record<string, EulerLabelEntity> = {};
	for (const [key, entity] of Object.entries(data ?? {})) {
		const addresses: Record<string, string> = {};
		for (const [address, label] of Object.entries(entity.addresses ?? {})) {
			const normalized = tryNormalizeAddress(address);
			if (normalized) addresses[normalized] = label;
		}
		entities[key] = {
			...entity,
			addresses,
			url: isHttpUrl(entity.url) ? entity.url : "",
		};
	}
	return entities;
};

const normalizePoints = (
	points: EulerLabelPoint[],
): Record<string, EulerLabelPoint[]> => {
	const byVault: Record<string, EulerLabelPoint[]> = {};
	for (const point of points ?? []) {
		if (!Array.isArray(point.collateralVaults)) continue;
		for (const vaultAddress of point.collateralVaults) {
			const normalized = tryNormalizeAddress(vaultAddress);
			if (!normalized) continue;
			byVault[normalized] ??= [];
			byVault[normalized]!.push(point);
		}
	}
	return byVault;
};

const normalizeEarnVaults = (
	entries: Array<string | EulerLabelEarnVaultEntry>,
) => {
	const earnVaults: string[] = [];
	const earnVaultBlocks: Record<string, string[]> = {};
	const earnVaultRestrictions: Record<string, string[]> = {};
	const featuredEarnVaults = new Set<string>();
	const deprecatedEarnVaults: Record<string, string> = {};
	const earnVaultDescriptions: Record<string, string> = {};
	const earnVaultNotices: Record<string, string> = {};
	const notExplorableEarnVaults = new Set<string>();
	const earnVaultEntries: Record<string, EulerLabelEarnVaultEntry> = {};

	for (const entry of entries ?? []) {
		const normalized = tryNormalizeAddress(
			typeof entry === "string" ? entry : entry.address,
		);
		if (!normalized) continue;
		const key = normalized.toLowerCase();
		earnVaults.push(normalized);
		if (typeof entry === "string") {
			earnVaultEntries[key] = { address: normalized };
			continue;
		}
		const normalizedEntry = { ...entry, address: normalized };
		earnVaultEntries[key] = normalizedEntry;
		if (entry.block?.length) earnVaultBlocks[key] = entry.block;
		if (entry.restricted?.length) earnVaultRestrictions[key] = entry.restricted;
		if (entry.featured) featuredEarnVaults.add(normalized);
		if (entry.deprecated)
			deprecatedEarnVaults[key] = entry.deprecationReason ?? "";
		if (entry.description) earnVaultDescriptions[key] = entry.description;
		if (entry.portfolioNotice) earnVaultNotices[key] = entry.portfolioNotice;
		if (entry.notExplorable) notExplorableEarnVaults.add(key);
	}

	return {
		earnVaults,
		earnVaultEntries,
		earnVaultBlocks,
		earnVaultRestrictions,
		featuredEarnVaults,
		deprecatedEarnVaults,
		earnVaultDescriptions,
		earnVaultNotices,
		notExplorableEarnVaults,
	};
};

const normalizeAssets = (entries: EulerLabelAssetEntry[]) => {
	const assetBlocks: Record<string, string[]> = {};
	const assetRestrictions: Record<string, string[]> = {};
	const assetPatternRules: EulerLabelAssetPatternRule[] = [];

	for (const entry of entries ?? []) {
		if (!entry) continue;
		const normalizedAddress = tryNormalizeAddress(entry.address);
		if (normalizedAddress) {
			const key = normalizedAddress.toLowerCase();
			if (entry.block?.length) assetBlocks[key] = entry.block;
			if (entry.restricted?.length) assetRestrictions[key] = entry.restricted;
		}

		const rule: EulerLabelAssetPatternRule = {
			block: entry.block?.length ? entry.block : undefined,
			restricted: entry.restricted?.length ? entry.restricted : undefined,
		};
		if (!rule.block && !rule.restricted) continue;

		if (entry.symbols?.length) {
			rule.symbolsLower = new Set(entry.symbols.map((s) => s.toLowerCase()));
		}
		if (entry.names?.length) {
			rule.namesLower = new Set(entry.names.map((s) => s.toLowerCase()));
		}
		if (entry.symbolRegex) {
			try {
				rule.symbolRegex = new RegExp(entry.symbolRegex, "i");
			} catch {
				// Match lite semantics: invalid regexes do not poison the whole file.
			}
		}
		if (entry.nameRegex) {
			try {
				rule.nameRegex = new RegExp(entry.nameRegex, "i");
			} catch {
				// Match lite semantics: invalid regexes do not poison the whole file.
			}
		}
		if (
			rule.symbolsLower ||
			rule.symbolRegex ||
			rule.namesLower ||
			rule.nameRegex
		) {
			assetPatternRules.push(rule);
		}
	}

	return { assetBlocks, assetRestrictions, assetPatternRules };
};

const applyVaultOverrides = (
	product: EulerLabelProduct,
	vaultAddress: string,
): EulerLabelProduct => {
	const override = product.vaultOverrides?.[vaultAddress];
	if (!override) return product;
	return {
		...product,
		...(override.name !== undefined && { name: override.name }),
		...(override.description !== undefined && {
			description: override.description,
		}),
		...(override.portfolioNotice !== undefined && {
			portfolioNotice: override.portfolioNotice,
		}),
		...(override.deprecationReason !== undefined && {
			deprecationReason: override.deprecationReason,
		}),
	};
};

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
	async fetchEulerLabelsEarnVaults(
		chainId: number,
	): Promise<Array<string | EulerLabelEarnVaultEntry>> {
		return this.adapter.fetchEulerLabelsEarnVaults?.(chainId) ?? [];
	}
	async fetchEulerLabelsAssets(
		chainId: number,
	): Promise<EulerLabelAssetEntry[]> {
		return this.adapter.fetchEulerLabelsAssets?.(chainId) ?? [];
	}

	async fetchEulerLabelsData(chainId: number): Promise<EulerLabelsData> {
		const [entitiesRaw, productsRaw, pointsRaw, earnRaw, assetsRaw] =
			await Promise.all([
				this.fetchEulerLabelsEntities(chainId).catch(
					() => ({}) as Record<string, EulerLabelEntity>,
				),
				this.fetchEulerLabelsProducts(chainId).catch(
					() => ({}) as Record<string, EulerLabelProduct>,
				),
				this.fetchEulerLabelsPoints(chainId).catch(
					() => [] as EulerLabelPoint[],
				),
				this.fetchEulerLabelsEarnVaults(chainId).catch(
					() => [] as Array<string | EulerLabelEarnVaultEntry>,
				),
				this.fetchEulerLabelsAssets(chainId).catch(
					() => [] as EulerLabelAssetEntry[],
				),
			]);

		const normalizedProducts = normalizeProducts(productsRaw);
		const earn = normalizeEarnVaults(earnRaw);
		const assets = normalizeAssets(assetsRaw);

		return {
			...EMPTY_LABELS_DATA,
			products: normalizedProducts.products,
			verifiedVaultAddresses: normalizedProducts.vaultAddresses,
			entities: normalizeEntities(entitiesRaw),
			points: normalizePoints(pointsRaw),
			earnVaults: earn.earnVaults,
			earnVaultEntries: earn.earnVaultEntries,
			earnVaultBlocks: earn.earnVaultBlocks,
			earnVaultRestrictions: earn.earnVaultRestrictions,
			featuredEarnVaults: earn.featuredEarnVaults,
			deprecatedEarnVaults: earn.deprecatedEarnVaults,
			earnVaultDescriptions: earn.earnVaultDescriptions,
			earnVaultNotices: earn.earnVaultNotices,
			notExplorableEarnVaults: earn.notExplorableEarnVaults,
			assetBlocks: assets.assetBlocks,
			assetRestrictions: assets.assetRestrictions,
			assetPatternRules: assets.assetPatternRules,
		};
	}

	async populateLabels(vaults: ERC4626Vault[]): Promise<void> {
		if (vaults.length === 0) return;

		const chainId = vaults[0]!.chainId;
		const labelsData = await this.fetchEulerLabelsData(chainId);

		// Pre-index products by lowercase vault address for efficient lookup
		const productsByVault = new Map<string, EulerLabelProduct[]>();
		for (const product of Object.values(labelsData.products)) {
			for (const vaultAddr of [
				...product.vaults,
				...(product.deprecatedVaults ?? []),
			]) {
				const key = vaultAddr.toLowerCase();
				const list = productsByVault.get(key) ?? [];
				list.push(product);
				productsByVault.set(key, list);
			}
		}

		// Pre-index deprecated vaults: address -> deprecationReason
		const deprecatedVaultsMap = new Map<string, string>();
		for (const product of Object.values(labelsData.products)) {
			if (!product.deprecatedVaults) continue;
			for (const vaultAddr of product.deprecatedVaults) {
				const normalized = tryNormalizeAddress(vaultAddr);
				if (!normalized) continue;
				const override =
					product.vaultOverrides?.[normalized]?.deprecationReason;
				deprecatedVaultsMap.set(
					normalized.toLowerCase(),
					override ?? product.deprecationReason ?? "",
				);
			}
		}

		for (const vault of vaults) {
			const normalizedAddress = normalizeAddressOrThrow(vault.address);
			const addrLower = normalizedAddress.toLowerCase();

			// Resolve products this vault belongs to (with logos)
			const products = (productsByVault.get(addrLower) ?? []).map((p) => {
				const product = applyVaultOverrides(p, normalizedAddress);
				return {
					...product,
					logo: product.logo ? this.resolveLogoUrl(product.logo) : undefined,
				};
			});

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
					const entity = labelsData.entities[slug];
					if (!entity) continue;
					entities.push({
						...entity,
						logo: entity.logo ? this.resolveLogoUrl(entity.logo) : entity.logo,
					});
				}
			}

			// Resolve points where this vault is a collateral vault (with logos)
			const points = (labelsData.points[normalizedAddress] ?? []).map((p) => ({
				...p,
				logo: p.logo ? this.resolveLogoUrl(p.logo) : p.logo,
			}));

			const earnVault = labelsData.earnVaultEntries[addrLower];
			const earnDeprecationReason = labelsData.deprecatedEarnVaults[addrLower];
			const deprecationReason =
				deprecatedVaultsMap.get(addrLower) ?? earnDeprecationReason;

			const hasAnyLabel =
				products.length > 0 ||
				entities.length > 0 ||
				points.length > 0 ||
				deprecationReason !== undefined ||
				earnVault !== undefined;

			if (hasAnyLabel) {
				vault.eulerLabel = {
					entities,
					products,
					points,
					...(deprecationReason !== undefined && {
						deprecated: true,
						deprecationReason,
					}),
					...(earnVault && { earnVault }),
					...(earnVault?.description && { description: earnVault.description }),
					...(earnVault?.portfolioNotice && {
						portfolioNotice: earnVault.portfolioNotice,
					}),
					...(earnVault?.featured && { featured: true }),
					...(earnVault?.notExplorable && { notExplorable: true }),
					...(earnVault?.block && { block: earnVault.block }),
					...(earnVault?.restricted && { restricted: earnVault.restricted }),
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
	getEulerLabelsEarnVaultsUrl?: (chainId: number) => string;
	getEulerLabelsAssetsUrl?: (chainId: number) => string;
	getEulerLabelsGlobalAssetsUrl?: () => string;
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

	queryEulerLabelsEarnVaults = async (
		url: string,
	): Promise<Array<string | EulerLabelEarnVaultEntry>> => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch Euler labels earn vaults: ${response.statusText}`,
			);
		}
		return response.json() as Promise<Array<string | EulerLabelEarnVaultEntry>>;
	};

	setQueryEulerLabelsEarnVaults(
		fn: typeof this.queryEulerLabelsEarnVaults,
	): void {
		this.queryEulerLabelsEarnVaults = fn;
	}

	queryEulerLabelsAssets = async (
		url: string,
	): Promise<EulerLabelAssetEntry[]> => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch Euler labels assets: ${response.statusText}`,
			);
		}
		return response.json() as Promise<EulerLabelAssetEntry[]>;
	};

	setQueryEulerLabelsAssets(fn: typeof this.queryEulerLabelsAssets): void {
		this.queryEulerLabelsAssets = fn;
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
	async fetchEulerLabelsEarnVaults(
		chainId: number,
	): Promise<Array<string | EulerLabelEarnVaultEntry>> {
		if (!this.config.getEulerLabelsEarnVaultsUrl) return [];
		return this.queryEulerLabelsEarnVaults(
			this.config.getEulerLabelsEarnVaultsUrl(chainId),
		);
	}
	async fetchEulerLabelsAssets(
		chainId: number,
	): Promise<EulerLabelAssetEntry[]> {
		if (!this.config.getEulerLabelsAssetsUrl) return [];
		const urls = [
			this.config.getEulerLabelsAssetsUrl(chainId),
			this.config.getEulerLabelsGlobalAssetsUrl?.(),
		].filter((url): url is string => typeof url === "string");
		const results = await Promise.all(
			urls.map((url) => this.queryEulerLabelsAssets(url).catch(() => [])),
		);
		return results.flat();
	}
}
