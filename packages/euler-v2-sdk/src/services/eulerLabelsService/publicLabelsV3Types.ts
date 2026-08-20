import type { EulerLabelsData } from "../../entities/EulerLabels.js";

export const PUBLIC_LABELS_RUNTIME_VERSION = "latest";
export const PUBLIC_LABELS_PAGE_SIZE = 100;

export interface PublicLabelsMeta {
	total?: number;
	limit?: number;
	offset?: number;
	timestamp: string;
}

export interface PublicLabelsResponse<T> {
	data: T;
	meta: PublicLabelsMeta;
}

export interface PublicVaultCampaign {
	name: string;
	logo: string | null;
	type: "deposit" | "borrow";
}

export interface PublicVaultLabel {
	chainId: number;
	address: string;
	vaultType: "evk" | "earn" | "securitize" | "escrow";
	productId: string | null;
	entityId: string | null;
	name: string | null;
	description: string | null;
	portfolioNotice: string | null;
	isDeprecated: boolean;
	deprecationReason: string | null;
	tags: string[];
	campaigns: PublicVaultCampaign[] | null;
	createdAt: string;
	updatedAt: string;
}

export interface PublicProductLabel {
	id: string;
	chainId: number;
	entityId: string;
	coBrandEntityIds?: string[] | null;
	name: string;
	logo?: string | null;
	description: string | null;
	url: string | null;
	portfolioNotice: string | null;
	isDeprecated: boolean;
	deprecationReason: string | null;
	governanceMode: string;
	createdAt: string;
	updatedAt: string;
}

export interface PublicEntityLabel {
	id: string;
	name: string;
	logo: string | null;
	description: string | null;
	url: string | null;
	socialTwitter: string | null;
	socialYoutube: string | null;
	socialDiscord: string | null;
	socialTelegram: string | null;
	socialGithub: string | null;
	socialDefillama: string | null;
	legalEntityName: string | null;
	riskMethodology: string | null;
	security: string | null;
	termsOfService: string | null;
	licenses: string | null;
	disclaimers: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface PublicEntityAddress {
	entityId: string;
	chainId: number;
	address: string;
	label: string | null;
}

export interface PublicGeoPolicy {
	id: string;
	chainId: number | null;
	productId: string | null;
	vaultAddress: string | null;
	assetAddress: string | null;
	assetSymbols?: string[] | null;
	assetSymbolRegex?: string | null;
	assetNames?: string[] | null;
	assetNameRegex?: string | null;
	countries: string[];
	policyType: "block" | "restrict";
	reason: string | null;
	createdAt: string;
}

export interface PublicLabelsSource {
	vaults: PublicVaultLabel[];
	products: PublicProductLabel[];
	entities: PublicEntityLabel[];
	entityAddresses: PublicEntityAddress[];
	geoPolicies: PublicGeoPolicy[];
}

export interface PublicLabelsSnapshot {
	/** Concrete immutable publication used for every request in the snapshot. */
	version: string;
	publicLabels: PublicLabelsSource;
}

export type PublicEulerLabelsData = EulerLabelsData & {
	/** Versioned policy records are informational until effective precedence is specified. */
	rawGeoPolicies: PublicGeoPolicy[];
};

export type PublicLabelsQuery = Record<string, string | number | undefined>;

export type PublicLabelsRequest = <T>(
	path: string,
	query: PublicLabelsQuery,
) => Promise<PublicLabelsResponse<T>>;

export interface PublicLabelsV3AdapterConfig {
	endpoint: string;
	apiKey?: string;
	/** Optional transport injection for proxies, tests, or application-owned caching. */
	request?: PublicLabelsRequest;
}

export interface PublishedLabelVersion {
	versionKey?: string;
	status?: string;
	aliases?: string[];
	isLatest?: boolean;
}
