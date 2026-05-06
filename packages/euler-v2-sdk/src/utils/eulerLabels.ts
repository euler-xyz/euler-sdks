import { getAddress } from "viem";
import type { EulerEarn } from "../entities/EulerEarn.js";
import type {
	EulerLabelEntity,
	EulerLabelPoint,
	EulerLabelProduct,
	EulerLabelsData,
} from "../entities/EulerLabels.js";

export const createEmptyEulerLabelsData = (): EulerLabelsData => ({
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
});

const normalizeAddress = (address: string): string => {
	try {
		return getAddress(address);
	} catch {
		return address.toLowerCase();
	}
};

export const applyEulerLabelVaultOverrides = (
	product: EulerLabelProduct,
	vaultAddress: string,
): EulerLabelProduct => {
	const override = product.vaultOverrides?.[normalizeAddress(vaultAddress)];
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

export const getEulerLabelProductByVault = (
	data: EulerLabelsData,
	vaultAddress: string,
): EulerLabelProduct | undefined => {
	const normalized = normalizeAddress(vaultAddress);
	return Object.values(data.products).find(
		(product) =>
			product.vaults.includes(normalized) ||
			(product.deprecatedVaults?.includes(normalized) ?? false),
	);
};

export const getEulerLabelProductKeyByVault = (
	data: EulerLabelsData,
	vaultAddress: string,
): string | undefined => {
	const normalized = normalizeAddress(vaultAddress);
	return Object.keys(data.products).find((key) => {
		const product = data.products[key];
		if (!product) return false;
		return (
			product.vaults.includes(normalized) ||
			(product.deprecatedVaults?.includes(normalized) ?? false)
		);
	});
};

export const getEulerLabelVaultBlock = (
	data: EulerLabelsData,
	vaultAddress: string,
): string[] | undefined => {
	const normalized = normalizeAddress(vaultAddress);
	const product = getEulerLabelProductByVault(data, normalized);
	const override = product?.vaultOverrides?.[normalized];
	return override?.block ?? product?.block;
};

export const getEulerLabelEarnVaultBlock = (
	data: EulerLabelsData,
	vaultAddress: string,
): string[] | undefined => data.earnVaultBlocks[normalizeAddress(vaultAddress).toLowerCase()];

export const getEulerLabelVaultRestricted = (
	data: EulerLabelsData,
	vaultAddress: string,
): string[] | undefined => {
	const normalized = normalizeAddress(vaultAddress);
	const product = getEulerLabelProductByVault(data, normalized);
	return product?.vaultOverrides?.[normalized]?.restricted;
};

export const getEulerLabelEarnVaultRestricted = (
	data: EulerLabelsData,
	vaultAddress: string,
): string[] | undefined =>
	data.earnVaultRestrictions[normalizeAddress(vaultAddress).toLowerCase()];

export const getEulerLabelAssetBlock = (
	data: EulerLabelsData,
	assetAddress: string,
): string[] | undefined =>
	assetAddress
		? data.assetBlocks[normalizeAddress(assetAddress).toLowerCase()]
		: undefined;

export const getEulerLabelAssetRestricted = (
	data: EulerLabelsData,
	assetAddress: string,
): string[] | undefined =>
	assetAddress
		? data.assetRestrictions[normalizeAddress(assetAddress).toLowerCase()]
		: undefined;

export const isEulerLabelVaultFeatured = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => {
	const normalized = normalizeAddress(vaultAddress);
	if (
		Object.values(data.products).some(
			(product) => product.featuredVaults?.includes(normalized) ?? false,
		)
	) {
		return true;
	}
	return (
		data.featuredEarnVaults.has(normalized) ||
		data.featuredEarnVaults.has(normalized.toLowerCase())
	);
};

export const isEulerLabelEarnVaultDeprecated = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => normalizeAddress(vaultAddress).toLowerCase() in data.deprecatedEarnVaults;

export const isEulerLabelEarnVaultNotExplorable = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => data.notExplorableEarnVaults.has(normalizeAddress(vaultAddress).toLowerCase());

export const getEulerLabelEarnVaultDeprecationReason = (
	data: EulerLabelsData,
	vaultAddress: string,
): string => data.deprecatedEarnVaults[normalizeAddress(vaultAddress).toLowerCase()] ?? "";

export const getEulerLabelEarnVaultDescription = (
	data: EulerLabelsData,
	vaultAddress: string,
): string => data.earnVaultDescriptions[normalizeAddress(vaultAddress).toLowerCase()] ?? "";

export const getEulerLabelEarnVaultNotice = (
	data: EulerLabelsData,
	vaultAddress: string,
): string => data.earnVaultNotices[normalizeAddress(vaultAddress).toLowerCase()] ?? "";

export const getEulerLabelVaultNotice = (
	data: EulerLabelsData,
	vaultAddress: string,
): string => {
	const earnNotice = getEulerLabelEarnVaultNotice(data, vaultAddress);
	if (earnNotice) return earnNotice;

	const normalized = normalizeAddress(vaultAddress);
	const product = getEulerLabelProductByVault(data, normalized);
	const override = product?.vaultOverrides?.[normalized];
	if (override?.portfolioNotice !== undefined) return override.portfolioNotice;

	return product?.portfolioNotice ?? "";
};

export const isEulerLabelVaultNoticeSpecific = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => {
	if (getEulerLabelEarnVaultNotice(data, vaultAddress)) return true;
	const normalized = normalizeAddress(vaultAddress);
	const product = getEulerLabelProductByVault(data, normalized);
	return product?.vaultOverrides?.[normalized]?.portfolioNotice !== undefined;
};

export const isEulerLabelVaultDeprecated = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => {
	const normalized = normalizeAddress(vaultAddress);
	if (normalized.toLowerCase() in data.deprecatedEarnVaults) return true;
	return Object.values(data.products).some(
		(product) => product.deprecatedVaults?.includes(normalized) ?? false,
	);
};

export const isEulerLabelVaultNotExplorable = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => getEulerLabelProductByVault(data, vaultAddress)?.notExplorable === true;

export const isEulerLabelVaultNotExplorableLend = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => {
	const normalized = normalizeAddress(vaultAddress);
	const product = getEulerLabelProductByVault(data, normalized);
	if (product?.notExplorable === true) return true;
	return product?.vaultOverrides?.[normalized]?.notExplorableLend === true;
};

export const isEulerLabelVaultNotExplorableBorrow = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => {
	const normalized = normalizeAddress(vaultAddress);
	const product = getEulerLabelProductByVault(data, normalized);
	if (product?.notExplorable === true) return true;
	return product?.vaultOverrides?.[normalized]?.notExplorableBorrow === true;
};

export const isEulerLabelVaultKeyring = (
	data: EulerLabelsData,
	vaultAddress: string,
): boolean => {
	const normalized = normalizeAddress(vaultAddress);
	const product = getEulerLabelProductByVault(data, normalized);
	if (product?.keyring === true) return true;
	return product?.vaultOverrides?.[normalized]?.keyring === true;
};

export const isEulerLabelProductKeyring = (
	data: EulerLabelsData,
	productKey: string,
): boolean => data.products[productKey]?.keyring === true;

export const getEulerLabelEntitiesByVault = (
	data: EulerLabelsData,
	vault: { governorAdmin?: string; governor?: string },
): EulerLabelEntity[] => {
	const governor = vault.governorAdmin ?? vault.governor;
	if (!governor) return [];
	const normalizedGovernor = normalizeAddress(governor);
	return Object.values(data.entities).filter((entity) =>
		Object.keys(entity.addresses ?? {}).includes(normalizedGovernor),
	);
};

export const getEulerLabelEntitiesByEarnVault = (
	data: EulerLabelsData,
	earnVault: EulerEarn,
): EulerLabelEntity[] => {
	const ownerAddress = normalizeAddress(earnVault.governance.owner);
	return Object.values(data.entities).filter((entity) =>
		Object.keys(entity.addresses ?? {}).includes(ownerAddress),
	);
};

export const getEulerLabelPointsByVault = (
	data: EulerLabelsData,
	vaultAddress: string,
): EulerLabelPoint[] => data.points[normalizeAddress(vaultAddress)] ?? [];

export const getEulerLabelVaultProductName = (
	data: EulerLabelsData,
	vaultAddress: string,
): string => {
	const product = getEulerLabelProductByVault(data, vaultAddress);
	return product ? applyEulerLabelVaultOverrides(product, vaultAddress).name : "";
};
