# EulerLabels Entity Types

`EulerLabels` exports normalized label metadata types used by vault, earn,
asset, product, entity, and points enrichment. These are plain data types rather
than classes.

## `EulerLabelEntity`

| Property | Type | Description |
| --- | --- | --- |
| `name` | `string` | Entity display name. |
| `logo` | `string` | Entity logo URL. |
| `description` | `string` | Entity description. |
| `url` | `string` | Entity website URL. |
| `addresses` | `Record<string, string>` | Entity addresses keyed by label-defined purpose. |
| `social.twitter` | `string` | Twitter/X URL or handle from labels data. |
| `social.youtube` | `string` | YouTube URL or handle from labels data. |
| `social.discord` | `string` | Discord URL or handle from labels data. |
| `social.telegram` | `string` | Telegram URL or handle from labels data. |
| `social.github` | `string` | GitHub URL or handle from labels data. |

## `EulerLabelProduct`

| Property | Type | Description |
| --- | --- | --- |
| `name` | `string` | Product display name. |
| `description` | `string` | Product description. |
| `entity` | `string | string[] | undefined` | Curator entity slug or slugs. |
| `url` | `string` | Product URL. |
| `logo` | `string | undefined` | Product logo URL. |
| `vaults` | `string[]` | Product vault addresses. |
| `deprecatedVaults` | `string[] | undefined` | Vault addresses marked deprecated for this product. |
| `deprecationReason` | `string | undefined` | Deprecation reason exposed by normalizers. |
| `deprecateReason` | `string | undefined` | Alternative spelling accepted from labels data. |
| `block` | `string[] | undefined` | Block rules attached to the product. |
| `restricted` | `string[] | undefined` | Restriction rules attached to the product. |
| `notExplorable` | `boolean | undefined` | Whether product vaults should be hidden from explorer-style surfaces. |
| `tags` | `string[] | undefined` | Freeform classification tags (e.g. `"keyring"`, `"access control"`, `"governance limited"`, `"cyclical note"`). |
| `portfolioNotice` | `string | undefined` | Product-level portfolio notice. |
| `vaultOverrides` | `Record<string, EulerLabelVaultOverride> | undefined` | Per-vault product overrides keyed by vault address. |

## `EulerLabelVaultOverride`

| Property | Type | Description |
| --- | --- | --- |
| `name` | `string | undefined` | Vault display-name override. |
| `description` | `string | undefined` | Vault description override. |
| `portfolioNotice` | `string | undefined` | Vault portfolio notice override. |
| `deprecationReason` | `string | undefined` | Vault deprecation reason override. |
| `block` | `string[] | undefined` | Vault block-rule override. |
| `restricted` | `string[] | undefined` | Vault restriction-rule override. |
| `notExplorableLend` | `boolean | undefined` | Whether lend exploration should hide this vault. |
| `notExplorableBorrow` | `boolean | undefined` | Whether borrow exploration should hide this vault. |
| `tags` | `string[] | undefined` | Freeform classification tags overriding/augmenting product tags (e.g. `"keyring"`, `"access control"`, `"recently added"`, `"cyclical note"`). |

## `EulerLabelPoint`

| Property | Type | Description |
| --- | --- | --- |
| `name` | `string` | Points program display name. |
| `logo` | `string` | Points program logo URL. |
| `description` | `string | undefined` | Points program description. |
| `url` | `string | undefined` | Points program URL. |
| `entity` | `string | string[] | undefined` | Related entity slug or slugs. |
| `token` | `string | undefined` | Points token identifier. |
| `collateralVaults` | `string[] | undefined` | Vaults that earn points as collateral. |
| `liabilityVaults` | `string[] | undefined` | Vaults that earn points as liabilities. |
| `skipTooltipPrefix` | `boolean | undefined` | Whether UI tooltip text should omit its standard prefix. |
| `isTurtleClub` | `boolean | undefined` | Whether the points program is marked as Turtle Club. |

## `EulerLabelEarnVaultEntry`

| Property | Type | Description |
| --- | --- | --- |
| `address` | `string` | Earn vault address. |
| `block` | `string[] | undefined` | Block rules for the earn vault. |
| `restricted` | `string[] | undefined` | Restriction rules for the earn vault. |
| `tags` | `string[] | undefined` | Freeform classification tags (e.g. `"recently added"`). |
| `deprecated` | `boolean | undefined` | Whether the earn vault is deprecated. |
| `deprecationReason` | `string | undefined` | Earn vault deprecation reason. |
| `description` | `string | undefined` | Earn vault description. |
| `portfolioNotice` | `string | undefined` | Earn vault portfolio notice. |
| `notExplorable` | `boolean | undefined` | Whether explorer-style surfaces should hide this earn vault. |

## `EulerLabelAssetEntry`

| Property | Type | Description |
| --- | --- | --- |
| `address` | `string | undefined` | Asset address matched by the rule. |
| `symbols` | `string[] | undefined` | Asset symbols matched by the rule. |
| `symbolRegex` | `string | undefined` | Symbol regular expression matched by the rule. |
| `names` | `string[] | undefined` | Asset names matched by the rule. |
| `nameRegex` | `string | undefined` | Name regular expression matched by the rule. |
| `block` | `string[] | undefined` | Block rules for matched assets. |
| `restricted` | `string[] | undefined` | Restriction rules for matched assets. |

## `EulerLabelAssetPatternRule`

| Property | Type | Description |
| --- | --- | --- |
| `block` | `string[] | undefined` | Block rules for matched assets. |
| `restricted` | `string[] | undefined` | Restriction rules for matched assets. |
| `symbolsLower` | `Set<string> | undefined` | Lowercase exact symbol matches. |
| `symbolRegex` | `RegExp | undefined` | Compiled symbol regular expression. |
| `namesLower` | `Set<string> | undefined` | Lowercase exact name matches. |
| `nameRegex` | `RegExp | undefined` | Compiled name regular expression. |

## `EulerLabelsData`

| Property | Type | Description |
| --- | --- | --- |
| `products` | `Record<string, EulerLabelProduct>` | Products keyed by slug. |
| `entities` | `Record<string, EulerLabelEntity>` | Entities keyed by slug. |
| `points` | `Record<string, EulerLabelPoint[]>` | Points programs keyed by vault or label-defined key. |
| `verifiedVaultAddresses` | `string[]` | Verified vault addresses. |
| `earnVaults` | `string[]` | Earn vault addresses. |
| `earnVaultEntries` | `Record<string, EulerLabelEarnVaultEntry>` | Earn vault entries keyed by address. |
| `earnVaultBlocks` | `Record<string, string[]>` | Earn vault block rules keyed by address. |
| `earnVaultRestrictions` | `Record<string, string[]>` | Earn vault restriction rules keyed by address. |
| `deprecatedEarnVaults` | `Record<string, string>` | Deprecated earn vault reasons keyed by address. |
| `earnVaultDescriptions` | `Record<string, string>` | Earn vault descriptions keyed by address. |
| `earnVaultNotices` | `Record<string, string>` | Earn vault portfolio notices keyed by address. |
| `notExplorableEarnVaults` | `Set<string>` | Earn vaults hidden from explorer-style surfaces. |
| `assetBlocks` | `Record<string, string[]>` | Asset block rules keyed by address. |
| `assetRestrictions` | `Record<string, string[]>` | Asset restriction rules keyed by address. |
| `assetPatternRules` | `EulerLabelAssetPatternRule[]` | Asset pattern rules compiled from symbol/name rules. |

## `EulerLabel`

| Property | Type | Description |
| --- | --- | --- |
| `entities` | `EulerLabelEntity[]` | Resolved entities for a vault. |
| `products` | `EulerLabelProduct[]` | Resolved products for a vault. |
| `points` | `EulerLabelPoint[]` | Resolved points programs for a vault. |
| `deprecated` | `boolean | undefined` | Whether the vault is deprecated. |
| `deprecationReason` | `string | undefined` | Vault deprecation reason. |
| `earnVault` | `EulerLabelEarnVaultEntry | undefined` | Resolved earn vault label entry. |
| `description` | `string | undefined` | Resolved vault description. |
| `portfolioNotice` | `string | undefined` | Resolved vault portfolio notice. |
| `notExplorable` | `boolean | undefined` | Whether explorer-style surfaces should hide this vault. |
| `block` | `string[] | undefined` | Resolved block rules. |
| `restricted` | `string[] | undefined` | Resolved restriction rules. |
