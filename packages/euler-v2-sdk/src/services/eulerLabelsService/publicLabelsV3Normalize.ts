import { getAddress } from "viem";
import type {
	EulerLabelEarnVaultEntry,
	EulerLabelEntity,
	EulerLabelPoint,
	EulerLabelProduct,
	EulerLabelVaultOverride,
} from "../../entities/EulerLabels.js";
import { createEmptyEulerLabelsData } from "../../utils/eulerLabels.js";
import type {
	PublicEntityAddress,
	PublicEntityLabel,
	PublicEulerLabelsData,
	PublicLabelsSource,
	PublicProductLabel,
	PublicVaultLabel,
} from "./publicLabelsV3Types.js";

const uniqueStrings = (values: Iterable<string>): string[] => [
	...new Set(values),
];

const present = <T>(value: T | null | undefined): T | undefined =>
	value === null || value === undefined ? undefined : value;

const safeHttpUrl = (value: string | null | undefined): string => {
	if (!value) return "";
	try {
		const protocol = new URL(value).protocol;
		return protocol === "http:" || protocol === "https:" ? value : "";
	} catch {
		return "";
	}
};

const makeVaultOverride = (
	vault: PublicVaultLabel,
): EulerLabelVaultOverride => ({
	...(present(vault.name) !== undefined && { name: vault.name! }),
	...(present(vault.description) !== undefined && {
		description: vault.description!,
	}),
	...(present(vault.portfolioNotice) !== undefined && {
		portfolioNotice: vault.portfolioNotice!,
	}),
	...(present(vault.deprecationReason) !== undefined && {
		deprecationReason: vault.deprecationReason!,
	}),
	...(vault.tags.length > 0 && { tags: [...vault.tags] }),
});

const buildEntity = (
	entity: PublicEntityLabel,
	addresses: PublicEntityAddress[],
): EulerLabelEntity => ({
	id: entity.id,
	name: entity.name,
	logo: safeHttpUrl(entity.logo),
	description: entity.description ?? "",
	url: safeHttpUrl(entity.url),
	...(present(entity.legalEntityName) !== undefined && {
		legalEntityName: entity.legalEntityName!,
	}),
	...(present(entity.riskMethodology) !== undefined && {
		riskMethodology: entity.riskMethodology!,
	}),
	...(present(entity.security) !== undefined && {
		security: entity.security!,
	}),
	...(present(entity.termsOfService) !== undefined && {
		termsOfService: entity.termsOfService!,
	}),
	...(present(entity.licenses) !== undefined && {
		licenses: entity.licenses!,
	}),
	...(present(entity.disclaimers) !== undefined && {
		disclaimers: entity.disclaimers!,
	}),
	addresses: Object.fromEntries(
		addresses.map((entry) => [getAddress(entry.address), entry.label ?? ""]),
	),
	social: {
		twitter: safeHttpUrl(entity.socialTwitter),
		youtube: safeHttpUrl(entity.socialYoutube),
		discord: safeHttpUrl(entity.socialDiscord),
		telegram: safeHttpUrl(entity.socialTelegram),
		github: safeHttpUrl(entity.socialGithub),
		defillama: safeHttpUrl(entity.socialDefillama),
	},
});

const productTags = (vaults: PublicVaultLabel[]): string[] | undefined => {
	if (vaults.length === 0) return undefined;
	const tags = uniqueStrings(vaults[0]!.tags).filter((tag) =>
		vaults.every((vault) => vault.tags.includes(tag)),
	);
	return tags.length > 0 ? tags : undefined;
};

const buildProduct = (
	product: PublicProductLabel,
	vaults: PublicVaultLabel[],
): EulerLabelProduct => {
	const active: string[] = [];
	const deprecated: string[] = [];
	const vaultOverrides: Record<string, EulerLabelVaultOverride> = {};

	for (const vault of vaults) {
		const address = getAddress(vault.address);
		if (vault.isDeprecated) deprecated.push(address);
		else active.push(address);
		vaultOverrides[address] = makeVaultOverride(vault);
	}

	const tags = productTags(vaults);
	const logo = safeHttpUrl(product.logo);
	return {
		id: product.id,
		chainId: product.chainId,
		name: product.name,
		description: product.description ?? "",
		...(product.portfolioNotice && {
			portfolioNotice: product.portfolioNotice,
		}),
		entity: product.entityId,
		coBrandEntityIds: [...(product.coBrandEntityIds ?? [])],
		url: safeHttpUrl(product.url),
		...(logo && { logo }),
		vaults: active,
		deprecatedVaults: deprecated,
		...(product.deprecationReason && {
			deprecationReason: product.deprecationReason,
		}),
		...(product.isDeprecated && { isDeprecated: true }),
		...(tags && { tags }),
		vaultOverrides,
	};
};

const standaloneProductKey = (address: string): string =>
	`__vault_${address.toLowerCase()}`;

/**
 * Empty-content inventory rows are indistinguishable from assessment-only
 * rows. Consumers that have an effective curation decision may add confirmed
 * plain-address rows after this content-only normalization step.
 */
export const hasPublishedVaultLabelContent = (
	vault: PublicVaultLabel,
): boolean =>
	Boolean(
		vault.productId ||
			vault.entityId ||
			vault.name ||
			vault.description ||
			vault.portfolioNotice ||
			vault.isDeprecated ||
			vault.deprecationReason ||
			vault.tags.length ||
			vault.campaigns?.length,
	);

const buildStandaloneProduct = (vault: PublicVaultLabel): EulerLabelProduct => {
	const address = getAddress(vault.address);
	return {
		id: standaloneProductKey(address),
		chainId: vault.chainId,
		isStandalone: true,
		name: vault.name ?? "",
		description: vault.description ?? "",
		...(vault.portfolioNotice && {
			portfolioNotice: vault.portfolioNotice,
		}),
		entity: vault.entityId ?? "",
		coBrandEntityIds: [],
		url: "",
		vaults: vault.isDeprecated ? [] : [address],
		deprecatedVaults: vault.isDeprecated ? [address] : [],
		...(vault.deprecationReason && {
			deprecationReason: vault.deprecationReason,
		}),
		...(vault.tags.length > 0 && { tags: [...vault.tags] }),
		vaultOverrides: { [address]: makeVaultOverride(vault) },
	};
};

export const normalizePublicLabelsData = (
	chainId: number,
	source: PublicLabelsSource,
): PublicEulerLabelsData => {
	const chainVaults = source.vaults.filter(
		(vault) =>
			vault.chainId === chainId && hasPublishedVaultLabelContent(vault),
	);
	const productRows = source.products.filter(
		(product) => product.chainId === chainId,
	);
	const vaultsByProduct = new Map<string, PublicVaultLabel[]>();

	for (const vault of chainVaults) {
		if (!vault.productId) continue;
		const rows = vaultsByProduct.get(vault.productId) ?? [];
		rows.push(vault);
		vaultsByProduct.set(vault.productId, rows);
	}

	const products: Record<string, EulerLabelProduct> = {};
	for (const product of productRows) {
		products[product.id] = buildProduct(
			product,
			vaultsByProduct.get(product.id) ?? [],
		);
	}

	for (const vault of chainVaults) {
		if (vault.productId) {
			if (!products[vault.productId]) {
				throw new Error(
					`Public Labels vault references missing product ${vault.productId}`,
				);
			}
			continue;
		}
		if (vault.vaultType !== "earn" && vault.vaultType !== "escrow") {
			products[standaloneProductKey(vault.address)] =
				buildStandaloneProduct(vault);
		}
	}

	const addressesByEntity = new Map<string, PublicEntityAddress[]>();
	for (const address of source.entityAddresses) {
		if (address.chainId !== chainId) continue;
		const rows = addressesByEntity.get(address.entityId) ?? [];
		rows.push(address);
		addressesByEntity.set(address.entityId, rows);
	}

	const entities = Object.fromEntries(
		source.entities.map((entity) => [
			entity.id,
			buildEntity(entity, addressesByEntity.get(entity.id) ?? []),
		]),
	) as Record<string, EulerLabelEntity>;

	const verifiedVaultAddresses: string[] = [];
	const earnVaults: string[] = [];
	const earnVaultEntries: Record<string, EulerLabelEarnVaultEntry> = {};
	const deprecatedEarnVaults: Record<string, string> = {};
	const earnVaultDescriptions: Record<string, string> = {};
	const earnVaultNotices: Record<string, string> = {};
	const points: Record<string, EulerLabelPoint[]> = {};

	for (const vault of chainVaults) {
		const address = getAddress(vault.address);
		const lower = address.toLowerCase();
		if (vault.vaultType === "earn") {
			earnVaults.push(address);
			earnVaultEntries[lower] = {
				address,
				...(vault.tags.length > 0 && { tags: [...vault.tags] }),
				...(vault.isDeprecated && { deprecated: true }),
				...(vault.deprecationReason && {
					deprecationReason: vault.deprecationReason,
				}),
				...(vault.description && { description: vault.description }),
				...(vault.portfolioNotice && {
					portfolioNotice: vault.portfolioNotice,
				}),
			};
			if (vault.isDeprecated) {
				deprecatedEarnVaults[lower] = vault.deprecationReason ?? "";
			}
			if (vault.description) {
				earnVaultDescriptions[lower] = vault.description;
			}
			if (vault.portfolioNotice) {
				earnVaultNotices[lower] = vault.portfolioNotice;
			}
		} else if (vault.vaultType !== "escrow") {
			verifiedVaultAddresses.push(address);
		}

		if (vault.campaigns?.length) {
			points[address] = vault.campaigns.map((campaign) => ({
				name: campaign.name,
				logo: safeHttpUrl(campaign.logo),
				type: campaign.type,
			}));
		}
	}

	return {
		...createEmptyEulerLabelsData(),
		products,
		entities,
		points,
		verifiedVaultAddresses: uniqueStrings(verifiedVaultAddresses),
		earnVaults: uniqueStrings(earnVaults),
		earnVaultEntries,
		deprecatedEarnVaults,
		earnVaultDescriptions,
		earnVaultNotices,
		rawGeoPolicies: source.geoPolicies.filter(
			(policy) => policy.chainId === null || policy.chainId === chainId,
		),
	};
};
