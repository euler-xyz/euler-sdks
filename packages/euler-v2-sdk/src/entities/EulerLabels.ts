export type EulerLabelVaults = {
  [address: string]: EulerLabelVault;
}
export type EulerLabelVault = {
  name: string
  description: string
  entity: string | string[]
}
export type EulerLabelEntity = {
  name: string
  logo: string
  description: string
  url: string
  addresses: Record<string, string>
  social: {
    twitter: string
    youtube: string
    discord: string
    telegram: string
    github: string
  }
}
export type EulerLabelProduct = {
  name: string
  description: string
  entity: string[]
  url: string
  logo?: string
  vaults: string[]
  deprecatedVaults?: string[]
  deprecationReason?: string
}
export type EulerLabelPoint = {
  name: string
  logo: string
  description?: string
  url?: string
  entity?: string | string[]
  token?: string
  collateralVaults?: string[]
  liabilityVaults?: string[]
  skipTooltipPrefix?: boolean
  isTurtleClub?: boolean
}

/** Combined label data resolved for a specific vault. Logos are resolved to full URLs. */
export type EulerLabel = {
  vault: EulerLabelVault
  entities: EulerLabelEntity[]
  products: EulerLabelProduct[]
  points: EulerLabelPoint[]
  deprecated?: boolean
  deprecationReason?: string
}