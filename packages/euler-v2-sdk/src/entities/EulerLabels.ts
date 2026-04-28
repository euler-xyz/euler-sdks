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

/** Combined label data resolved for a specific vault. Logos are resolved to full URLs.
 * Entities are derived from the products this vault belongs to. */
export type EulerLabel = {
  entities: EulerLabelEntity[];
  products: EulerLabelProduct[];
  points: EulerLabelPoint[];
  deprecated?: boolean;
  deprecationReason?: string;
};
