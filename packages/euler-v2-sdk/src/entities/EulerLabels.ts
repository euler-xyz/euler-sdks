export type EulerLabelEntity = {
	name: string;
	logo: string;
	description: string;
	url: string;
	addresses: Record<string, string>;
	social: {
		twitter: string;
		youtube: string;
		discord: string;
		telegram: string;
		github: string;
	};
};
export type EulerLabelProduct = {
	name: string;
	description: string;
	/** Entity slug(s) of the curator(s). The labels JSON uses a bare string for
	 * single-curator products and an array for multi-curator ones. */
	entity?: string | string[];
	url: string;
	logo?: string;
	vaults: string[];
	deprecatedVaults?: string[];
	deprecationReason?: string;
	/** Legacy spelling still present in some labels files. Normalizers should
	 * expose it as deprecationReason. */
	deprecateReason?: string;
	featuredVaults?: string[];
	block?: string[];
	restricted?: string[];
	notExplorable?: boolean;
	keyring?: boolean;
	portfolioNotice?: string;
	vaultOverrides?: Record<string, EulerLabelVaultOverride>;
};
export type EulerLabelVaultOverride = {
	name?: string;
	description?: string;
	portfolioNotice?: string;
	deprecationReason?: string;
	block?: string[];
	restricted?: string[];
	notExplorableLend?: boolean;
	notExplorableBorrow?: boolean;
	keyring?: boolean;
};
export type EulerLabelPoint = {
	name: string;
	logo: string;
	description?: string;
	url?: string;
	entity?: string | string[];
	token?: string;
	collateralVaults?: string[];
	liabilityVaults?: string[];
	skipTooltipPrefix?: boolean;
	isTurtleClub?: boolean;
};
export type EulerLabelEarnVaultEntry = {
	address: string;
	block?: string[];
	restricted?: string[];
	featured?: boolean;
	deprecated?: boolean;
	deprecationReason?: string;
	description?: string;
	portfolioNotice?: string;
	notExplorable?: boolean;
};
export type EulerLabelAssetEntry = {
	address?: string;
	symbols?: string[];
	symbolRegex?: string;
	names?: string[];
	nameRegex?: string;
	block?: string[];
	restricted?: string[];
};
export type EulerLabelAssetPatternRule = {
	block?: string[];
	restricted?: string[];
	symbolsLower?: Set<string>;
	symbolRegex?: RegExp;
	namesLower?: Set<string>;
	nameRegex?: RegExp;
};
export type EulerLabelsData = {
	products: Record<string, EulerLabelProduct>;
	entities: Record<string, EulerLabelEntity>;
	points: Record<string, EulerLabelPoint[]>;
	verifiedVaultAddresses: string[];
	earnVaults: string[];
	earnVaultEntries: Record<string, EulerLabelEarnVaultEntry>;
	earnVaultBlocks: Record<string, string[]>;
	earnVaultRestrictions: Record<string, string[]>;
	featuredEarnVaults: Set<string>;
	deprecatedEarnVaults: Record<string, string>;
	earnVaultDescriptions: Record<string, string>;
	earnVaultNotices: Record<string, string>;
	notExplorableEarnVaults: Set<string>;
	assetBlocks: Record<string, string[]>;
	assetRestrictions: Record<string, string[]>;
	assetPatternRules: EulerLabelAssetPatternRule[];
};

/** Combined label data resolved for a specific vault. Logos are resolved to full URLs.
 * Entities are derived from the products this vault belongs to. */
export type EulerLabel = {
	entities: EulerLabelEntity[];
	products: EulerLabelProduct[];
	points: EulerLabelPoint[];
	deprecated?: boolean;
	deprecationReason?: string;
	earnVault?: EulerLabelEarnVaultEntry;
	description?: string;
	portfolioNotice?: string;
	featured?: boolean;
	notExplorable?: boolean;
	block?: string[];
	restricted?: string[];
};
