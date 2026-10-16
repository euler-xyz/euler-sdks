# Labels

Labels are purely off-chain metadata. They have no effect on any on-chain calculations, pricing, or risk parameters.

`buildEulerSDK()` uses `EulerLabelsV3Service` with `PublicLabelsV3Adapter` by default. It reads published metadata from Public Labels V3 and retains live visibility, managing entities and geo policies in `PublicEulerLabelsData`. Applications can replace the default with their own complete labels flow through `servicesOverrides.eulerLabelsService`.

## What labels provide

- **Products** &mdash; named groupings of vaults with vault-level overrides, notices, deprecation, classification tags (e.g. `keyring`, `access control`, `governance limited`, `cyclical note`), and exploration flags
- **Entities** &mdash; the organisation(s) governing a vault (name, logo, website, socials)
- **Points** &mdash; third-party points programs available on specific vaults
- **Euler Earn entries** &mdash; Earn vault membership, descriptions, notices, block/restricted countries, classification tags, and deprecated/not-explorable flags
- **Geo policies** &mdash; live country rules in `rawGeoPolicies`; application-owned country rules in custom normalized bundles

The country fields (`block`/`restricted` on products, overrides and Earn entries, `earnVaultBlocks`, `earnVaultRestrictions`, `assetBlocks`, `assetRestrictions`, `assetPatternRules`) can be supplied by application-owned normalized bundles. Under the V3 adapters they are always empty and the helpers that read them answer nothing: the bundle carries the live rules as `rawGeoPolicies` and the application evaluates them itself (see [Public Labels V3](#public-labels-v3)).

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

Population applies display metadata and absolute V3 logo URLs without deriving a trust badge from product membership. A successful V3 refresh clears a vault's attached labels if its metadata is absent. Failed V3 reads reject; vault read services report label population failures through their existing `SOURCE_UNAVAILABLE` diagnostics.

The service interface also supports application-owned bundles. Narrow the returned data before accessing V3-only fields:

```typescript
if ('visibility' in labelsData) {
  const verdict = labelsData.visibility[vaultAddress.toLowerCase()]
  const geoPolicies = labelsData.rawGeoPolicies
  // Apply the application's verification and country policy here.
}
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

The default service inherits the resolved shared `v3ApiUrl` and `v3ApiKey` and decorates `queryPublicLabels` with the SDK's `buildQuery` (a five-second cache by default). The default endpoint is `https://v3.euler.finance`, dataset is `public`, and publication selector is `latest`. Override dataset, publication, transport, endpoint or key through `eulerLabelsV3AdapterConfig`:

```typescript
const sdk = await buildEulerSDK({
  config: { v3ApiUrl: 'https://app.example/api/internal/v3' },
  eulerLabelsV3AdapterConfig: { labelSet: 'public', version: 'latest' },
})
```

The usual config priority applies to shared endpoint/key values: `config` overrides the explicit adapter config, which overrides environment values. Absolute endpoints preserve a base path ending in `/v3` or append `/v3` otherwise. Root-relative endpoints are browser proxy prefixes: `/api/v3` produces `/api/v3/v3/labels/...`, so a proxy that strips `/api/v3` forwards the required `/v3/labels/...` API path. Query parameters and the resolved API key pass through both transports.

External query caches must use `context.getCacheKey(args)`. Labels keys include an opaque adapter scope: repeated reads on one adapter share entries, while separate adapters stay isolated even when they share an endpoint or request function. Endpoint credentials and API keys are not included in that scope. Rebuild the SDK or adapter when changing the source or authentication used by an injected request.

An injected `request` owns transport and authentication. V3 request or validation failures propagate without file fallback. With `disableV3: true`, labels reads fail lazily unless a custom service override is supplied.

`fetchEulerLabelsEntities` and `fetchEulerLabelsProducts` expose display metadata, including hidden records. `fetchEulerLabelsPoints` preserves deposit/borrow campaign scope. `fetchEulerLabelsEarnVaults` returns eligible Earn entries, while `fetchEulerLabelsData().earnVaultEntries` retains all published Earn metadata. `fetchEulerLabelsAssets` returns an empty list after a successful V3 read; evaluate `rawGeoPolicies` instead of using file country helpers.

Use `PublicLabelsV3Adapter` when an application consumes the versioned Public Labels dataset directly:

```typescript
import {
  PublicLabelsV3Adapter,
  getEulerLabelProductBrandEntities,
  normalizePublicLabelsData,
} from '@eulerxyz/euler-v2-sdk/public-labels'

const labels = new PublicLabelsV3Adapter({
  labelSet: 'public', // defaults to public
  version: 'latest', // or an immutable publication key
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

By default, runtime reads select `public` / `latest`. Configure `labelSet` and `version` on the adapter to select another published dataset or pin metadata. The adapter resolves `latest` within that set once, then includes the set and concrete version on vault/product labels and entity profiles. A concrete key is confirmed against the set's published versions in the same way before any labels read. An explicit method version overrides the configured default. Unsupported selector shapes, draft selectors and unavailable publications fail without falling back to the public dataset. Geo policies, entity addresses, platform tags and visibility are live overlays. A concrete publication key pins metadata but does not freeze those overlays:

```typescript
const snapshot = await labels.fetchPublicLabelsSnapshot(
  1,
  'v20260804151305236',
)
```

The adapter follows `meta.total` for all list endpoints with `limit=100` and `offset`, fetches managing and co-brand entity profiles, and normalizes the result into `PublicEulerLabelsData` (the common `EulerLabelsData` fields plus live V3 policy metadata). Product ownership stays in `product.entity`; display-only partners are exposed through `product.coBrandEntityIds`.

Applications can inject `request` to route reads through their own proxy, authentication, caching, and stale-response policy:

```typescript
const labels = new PublicLabelsV3Adapter({
  endpoint: 'https://app.example/api/internal/v3',
  request: async (path, query) => {
    return appOwnedPublicLabelsRequest(path, query)
  },
})
```

`rawGeoPolicies` contains live rules with `countriesResolved`; the application owns country evaluation and enforcement. The adapter reads `/labels/vaults` and `/labels/products` with `view=resolved` and global `/labels/entities` profiles and address lists. Visibility comes from the same `/labels/vaults` enumeration read with `include=visibility`, which attaches the live verdict to every labelled row on every chain, including chains without an indexer; a row whose verdict is not evaluated yet (`null`) is read directly from `/evk/vaults/{chainId}/{address}/visibility` (or `/earn/...`). No vault inventory is walked. `visibility` exposes the verdict for labelled vaults keyed by lowercase vault address. Trusted membership requires a managing entity and a visible or warning verdict; metadata remains available for hidden and pending records. This membership is not a full governance-verification badge. Applications retain their stronger verification rule and own freshness, caching and outage handling.


`fetchPublicGeoPolicies(request)` reads and validates the complete live geo collection across all chains. Validation rejects missing resolved countries, invalid scopes/addresses, duplicate IDs and malformed regexes; an authored empty collection is valid. `validatePublicGeoPolicies(value)` applies the same validation to an application-owned checkpoint.

Applications with a durable geo cache can pass its validated policies as the third argument to `fetchPublicLabelsSnapshot(chainId, version, geoPolicies)`. The adapter validates the supplied collection and embeds it atomically with metadata, without a second geo request. Omitting it performs the ordinary live fetch. Persisted timestamps, stale-on-error decisions and country enforcement remain application-owned.


## Custom labels flows

Use `servicesOverrides.eulerLabelsService` when the application owns fetching, source selection, validation, freshness or policy. This override takes precedence over built-in V3 configuration and remains available with `disableV3: true`. The SDK does not configure or fetch label files.

An application can implement `IEulerLabelsService` directly or extend the source-agnostic `EulerLabelsService` to reuse display population. Override `fetchEulerLabelsData` to return the complete normalized bundle unchanged; the base population routine calls that method without re-deriving membership or dropping custom policy fields:

```typescript
import {
  buildEulerSDK,
  EulerLabelsService,
  type EulerLabelsData,
} from '@eulerxyz/euler-v2-sdk'

class AppLabelsService extends EulerLabelsService {
  constructor(private readonly loadBundle: (chainId: number) => Promise<EulerLabelsData>) {
    const unsupported = async (): Promise<never> => {
      throw new Error('This application supplies complete labels bundles')
    }
    super({
      fetchEulerLabelsEntities: unsupported,
      fetchEulerLabelsProducts: unsupported,
      fetchEulerLabelsPoints: unsupported,
      fetchEulerLabelsEarnVaults: unsupported,
      fetchEulerLabelsAssets: unsupported,
    })
  }

  override fetchEulerLabelsData(chainId: number) {
    return this.loadBundle(chainId)
  }
}

const sdk = await buildEulerSDK({
  servicesOverrides: {
    eulerLabelsService: new AppLabelsService(loadApplicationLabels),
  },
})
```

The application implements `loadApplicationLabels`, including failure and refresh behavior. A V3 bundle can retain its `PublicEulerLabelsData` subtype. Pass a logo resolver to the base constructor if the application transforms image URLs. Collection methods in this example intentionally throw; applications that use them implement those methods themselves.

`normalizeEulerLabelsFileData(files)` and `EulerLabelsFileData` remain available from the root and `public-labels` exports for application-owned static snapshots. The pure helper derives `EulerLabelsData` from an already-loaded `{entities, products, points, earnVaults, assets}` collection. It performs no network reads, chooses no URL and does not add V3 visibility. The application owns fetching, completeness checks and policy before injecting the resulting bundle.

## Vault assessments

`sdk.vaultAssessmentService.fetchVaultAssessment(chainId, vaultAddress, family)` reads the raw EVK or Earn assessment from `/v3/{evk|earn}/vaults/{chainId}/{address}/assessment`. The service also has a root export, `VaultAssessmentService`, for applications that construct it separately. `family` is `evk` or `earn`.

```typescript
const assessment = await sdk.vaultAssessmentService.fetchVaultAssessment(
  chainId,
  vaultAddress,
  'evk',
)
// assessment is undefined when V3 has no assessment for this vault.
```

The parsed result contains `configStatus`, `checksStatus`, configuration and consistency findings, timestamps and `assessed`. Findings retain V3's `outcome` (`pass`, `fail`, `unknown` or `not_applicable`), `description`, optional `cause`, and optional `exempted` marker. An exempted failure is still a failure in the raw result; the application decides how to present accepted exceptions. Assessments are separate from the effective visibility verdict and do not establish verified membership or an overall risk rating.

Results are cached for five minutes by default; pass `{ fresh: true }` to request the endpoint again. A normal 404 returns `undefined`. A V3 `CHAIN_NOT_SUPPORTED` response throws `VaultAssessmentUnavailableError` with reason `chain-not-supported`, and an SDK built with `disableV3: true` throws the same typed error with reason `v3-disabled`. Applications can check either case with `isVaultAssessmentUnavailableError(error, reason)`. Other request or validation failures throw normally. Freshness policy, retries and UI wording belong to the application.
