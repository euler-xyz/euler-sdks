# Labels

Labels are purely off-chain metadata. They have no effect on any on-chain calculations, pricing, or risk parameters.

The default `EulerLabelsService` configuration reads the file-based [`euler-labels`](https://github.com/euler-xyz/euler-labels) dataset. The SDK also exposes `PublicLabelsV3Adapter` for the versioned Public Labels API.

## What labels provide

- **Products** &mdash; named groupings of vaults with vault-level overrides, notices, deprecation, classification tags (e.g. `keyring`, `access control`, `governance limited`, `cyclical note`), and exploration flags
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
  isEulerLabelVaultCyclicalNote,
  isEulerLabelVaultGovernanceLimited,
  isEulerLabelVaultHighUtilisationWarningSuppressed,
} from '@eulerxyz/euler-v2-sdk'

isEulerLabelVaultKeyring(labelsData, vaultAddress)         // tag "keyring"
isEulerLabelVaultAccessControlled(labelsData, vaultAddress) // tag "access control"
isEulerLabelVaultGovernanceLimited(labelsData, vaultAddress) // tag "governance limited"
isEulerLabelVaultHighUtilisationWarningSuppressed(labelsData, vaultAddress) // tag "suppress high utilisation warning"
isEulerLabelVaultCyclicalNote(labelsData, vaultAddress) // tag "cyclical note"
isEulerLabelProductKeyring(labelsData, productKey)
```

`isEulerLabelVaultRecentlyAdded(labelsData, vaultAddress)` resolves the `recently added` tag from product, vault override, or Earn-entry tags. To check any other tag, read `tags` directly off the resolved product, vault override, or Earn entry.

## Public Labels V3

Use `PublicLabelsV3Adapter` when an application consumes the versioned Public Labels dataset directly:

```typescript
import {
  PublicLabelsV3Adapter,
  getEulerLabelProductBrandEntities,
  normalizePublicLabelsData,
} from '@eulerxyz/euler-v2-sdk/public-labels'

const labels = new PublicLabelsV3Adapter({
  endpoint: 'https://v3.euler.finance/v3',
})

const snapshot = await labels.fetchPublicLabelsSnapshot(1)
const labelsData = normalizePublicLabelsData(1, snapshot.publicLabels)

console.log(snapshot.version)

const product = labelsData.products['kpk-securitize']
const brands = product
  ? getEulerLabelProductBrandEntities(product, labelsData.entities)
  : []
```

Normal runtime reads use `latest`. The adapter resolves that alias once, pins resolved vault/product labels and entity profiles to that publication. Geo policies, entity addresses, platform tags and visibility are live overlays. A concrete publication key pins metadata but does not freeze those overlays:

```typescript
const snapshot = await labels.fetchPublicLabelsSnapshot(
  1,
  'v20260804151305236',
)
```

The adapter follows `meta.total` for all list endpoints with `limit=100` and `offset`, fetches managing and co-brand entity profiles, and normalizes the result into `EulerLabelsData`. Product ownership stays in `product.entity`; display-only partners are exposed through `product.coBrandEntityIds`.

Applications can inject `request` to route reads through their own proxy, authentication, caching, and stale-response policy:

```typescript
const labels = new PublicLabelsV3Adapter({
  endpoint: 'https://app.example/api/internal/v3',
  request: async (path, query) => {
    return appOwnedPublicLabelsRequest(path, query)
  },
})
```

`rawGeoPolicies` contains live rules with `countriesResolved`; the application owns country evaluation and enforcement. The adapter reads `/labels/vaults` and `/labels/products` with `view=resolved`, global `/labels/entities` profiles and address lists, and the explicit full visibility inventory from `/evk/vaults` and `/earn/vaults`. `visibility` exposes the backend verdict keyed by lowercase vault address. Trusted membership requires a managing entity and a visible or warning verdict; metadata remains available for hidden and pending records. This membership is not a full governance-verification badge. Applications retain their stronger verification rule and own freshness, caching and outage handling.


`fetchPublicGeoPolicies(request)` reads and validates the complete live geo collection across all chains. Validation rejects missing resolved countries, invalid scopes/addresses, duplicate IDs and malformed regexes; an authored empty collection is valid. `validatePublicGeoPolicies(value)` applies the same validation to an application-owned checkpoint.

Applications with a durable geo cache can pass its validated policies as the third argument to `fetchPublicLabelsSnapshot(chainId, version, geoPolicies)`. The adapter validates the supplied collection and embeds it atomically with metadata, without a second geo request. Omitting it performs the ordinary live fetch. Persisted timestamps, stale-on-error decisions and country enforcement remain application-owned.
