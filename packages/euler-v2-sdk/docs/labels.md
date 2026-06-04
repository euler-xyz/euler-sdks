# Labels

Labels are purely off-chain metadata sourced from [`euler-labels`](https://github.com/euler-xyz/euler-labels). They have no effect on any on-chain calculations, pricing, or risk parameters. The labels provided by the SDK are the same data used by the official Euler UI.

## What labels provide

- **Products** &mdash; named groupings of vaults with vault-level overrides, notices, deprecation, classification tags (e.g. `keyring`, `access control`, `governance limited`), and exploration flags
- **Entities** &mdash; the organisation(s) governing a vault (name, logo, website, socials)
- **Points** &mdash; third-party points programs available on specific vaults
- **Euler Earn entries** &mdash; Earn vault membership, descriptions, notices, block/restricted countries, classification tags, and deprecated/not-explorable flags
- **Asset rules** &mdash; explicit or pattern-based block/restricted-country rules

## Usage

```typescript
import {
  buildEulerSDK,
  getEulerLabelProductByVault,
  getEulerLabelVaultNotice,
  isEulerLabelVaultDeprecated,
  isEulerLabelVaultRecentlyAdded,
} from '@eulerxyz/euler-v2-sdk'

const sdk = await buildEulerSDK()
const labelsData = await sdk.eulerLabelsService.fetchEulerLabelsData(1)

const vaultAddress = '0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2'

console.log(getEulerLabelProductByVault(labelsData, vaultAddress)?.name)
console.log(getEulerLabelVaultNotice(labelsData, vaultAddress))
console.log(isEulerLabelVaultDeprecated(labelsData, vaultAddress))
console.log(isEulerLabelVaultRecentlyAdded(labelsData, vaultAddress))
```

For normal vault reads, prefer `populateLabels` or `populateAll`; the SDK attaches a normalized `eulerLabel` object directly to populated vault entities:

```typescript
const { result: vaultEntity } = await sdk.vaultMetaService.fetchVault(1, vaultAddress, {
  populateLabels: true,
})

console.log(vaultEntity?.eulerLabel?.products[0]?.name)
console.log(vaultEntity?.eulerLabel?.portfolioNotice)
console.log(vaultEntity?.eulerLabel?.deprecated)
```

See [`examples/vaults/fetch-vault-details-example.ts`](../examples/vaults/fetch-vault-details-example.ts) for a complete working example.

## Classification tags

Products and vault overrides carry a freeform `tags: string[]` array rather than dedicated boolean flags. The SDK exposes helpers that resolve well-known tags for a vault (checking both the product and any vault-level override):

```typescript
import {
  isEulerLabelVaultKeyring,
  isEulerLabelProductKeyring,
  isEulerLabelVaultAccessControlled,
  isEulerLabelVaultGovernanceLimited,
} from '@eulerxyz/euler-v2-sdk'

isEulerLabelVaultKeyring(labelsData, vaultAddress)         // tag "keyring"
isEulerLabelVaultAccessControlled(labelsData, vaultAddress) // tag "access control"
isEulerLabelVaultGovernanceLimited(labelsData, vaultAddress) // tag "governance limited"
isEulerLabelProductKeyring(labelsData, productKey)
```

`isEulerLabelVaultRecentlyAdded(labelsData, vaultAddress)` resolves the `recently added` tag from product, vault override, or Earn-entry tags. To check any other tag, read `tags` directly off the resolved product, vault override, or Earn entry.
