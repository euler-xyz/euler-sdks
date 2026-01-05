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
  vaults: string[]
}