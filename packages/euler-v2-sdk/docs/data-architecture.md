# Data Architecture

## Overview

The SDK follows a layered architecture where **services** create **entities** using **adapters**, which in turn make external calls via injectable [`query*` methods](./caching-external-data-queries.md). Services compose with each other via the [population pattern](./cross-service-data-population.md) to progressively enrich entities with cross-domain data.

```
query* methods          Lowest level — individual network calls (RPC, subgraph, HTTP)
    ↓
Adapters                Combine queries, convert raw responses into entity interfaces (I*)
    ↓
Services                Construct entity class instances, orchestrate populations
    ↓
Entities                Rich objects with computed properties and populate methods
```

Every boundary is an interface, making each layer swappable and testable independently.

## Entities

Entities are the SDK's domain objects. Each entity has two parts:

- **`I<Entity>` interface** — plain serializable data shape (e.g. `IEVault`, `IAccount`). This is what adapters return.
- **Entity class** — implements the interface and adds methods: conversions, computed properties, `populate*` methods.

### Entity hierarchy

```
ERC4626Vault (base — address, shares, asset, totals)
  ├── EVault              (+ oracle, collaterals, interest rates, caps, hooks)
  ├── EulerEarn           (+ strategies, performance fee, adapter-provided 1h supply APY)
  └── SecuritizeCollateralVault  (+ governor, supply cap)

Account<TVaultEntity>    (owner, sub-accounts, positions, liquidity)
Wallet                   (balances, allowances per spender)
```

### Progressive enrichment

Entities start with core on-chain data. Optional fields (`marketPriceUsd`, `rewards`, `eulerLabel`, nested `vault` on positions) begin as `undefined` and are filled by calling `populate*` methods. This avoids unnecessary network calls when only basic data is needed.

```typescript
const vault = await eVaultService.fetchVault(1, '0x...')
// vault.marketPriceUsd is undefined

await vault.populateMarketPrices(priceService)
// vault.marketPriceUsd is now set
```

Populatable entities also expose `populated` boolean flags so consumers can reliably check enrichment state:

```typescript
vault.populated.marketPrices // true after market price population
account.populated.vaults     // true after vault mapping/population
earn.populated.strategyVaults // true after strategy vault population
```

### Linking vaults together

Vault entities are not stored in a global in-memory graph keyed by address. Population works on the current entity instances and creates new nested entity instances as needed.

For example, assume two EVaults:

- Vault A lists Vault B as collateral
- Vault B lists Vault A as collateral

If you call `populateCollaterals()` on Vault A, the SDK creates a Vault B entity inside `A.collaterals[i].vault`.  
If you then call `populateCollaterals()` on that Vault B entity, it creates a new copy of Vault A inside `B.collaterals[j].vault`. Repeating this process can keep expanding the object graph indefinitely.

This behavior is intentional. It keeps entity population deterministic and allows caching strategies at the source-data level (see `Query methods`), instead of enforcing identity-sharing rules in entity objects.

If your use case requires no per-population copies, use your own caching/identity layer and link entities manually, or provide a custom adapter/service implementation that caches per entity address.

### Computed properties

Some properties are derived from populated data. For example, `Account` attaches computed getters (`healthFactor`, `currentLTV`, `liquidationLTV`, `netValueUsd`) that calculate from position data and USD prices. These **depend on prior population** — e.g. `netValueUsd` requires that vaults have been populated with market prices first. If the underlying data hasn't been populated, computed values may be `undefined` or zero.

## Adapters

Adapters are the SDK's I/O boundary. They implement focused interfaces (e.g. `IEVaultAdapter`, `IAccountAdapter`) and handle all external communication. Services never make network calls directly.

### Types of adapters

| Type | Examples | Reads from |
|------|----------|------------|
| **Onchain** | `EVaultOnchainAdapter`, `AccountOnchainAdapter`, `WalletOnchainAdapter` | Lens contracts via RPC (`VaultLens`, `AccountLens`, `UtilsLens`) |
| **Subgraph** | `VaultTypeSubgraphAdapter`, `AccountVaultsSubgraphAdapter` | The Graph (indexed chain data — vault factories, account vault history) |
| **Backend / API** | `VaultTypeV3Adapter`, `PricingBackendClient`, `EulerLabelsURLAdapter` | REST APIs (vault type resolution, pricing, labels, rewards) |

### Adapter → entity interface

Each onchain adapter has a companion **converter function** that transforms raw Lens structs into the `I*` entity interface:

```
VaultLens RPC response  →  convertVaultInfoFullToIEVault()  →  IEVault
AccountLens RPC response  →  convertToSubAccount()          →  SubAccount
```

This keeps adapters thin and conversion logic pure and testable.

### Query methods

All external calls within adapters are defined as `query*` arrow-function properties. The [`BuildQueryFn`](./caching-external-data-queries.md) decorator wraps every `query*` method at construction time, enabling global caching, logging, or profiling without modifying SDK internals.

In the default SDK build, `buildEulerSDK()` installs a short-lived in-memory cache around all decorated `query*` methods. The default cache TTL is `5000ms`, which keeps bursty fetch paths from repeating identical RPC or HTTP requests while preserving near-real-time behavior. If a consumer provides `buildQuery`, that custom decorator replaces the built-in cache layer for SDK queries.

```typescript
class EVaultOnchainAdapter {
  queryEVaultInfoFull = async (provider, lensAddress, vault) => {
    return provider.readContract({ ... })
  }
}
```

### Call bundling for some queries

Some `query*` methods are implemented with call bundling (`createCallBundler`) to reduce request fanout.

How it works (briefly):

1. The adapter exposes a single-item query API (for example, "fetch one vault factory" or "fetch one asset price").
2. Concurrent calls made in the same event-loop tick are grouped into one batched request.
3. The batch response is split back into per-item results and each original caller receives only its own value.

This keeps the service API simple while reducing RPC/HTTP round trips and improving throughput for high-concurrency fetch paths.

## Services

Services are the primary API surface. Each service:

1. Receives an **adapter** via constructor injection
2. Calls the adapter to get `I*` plain data
3. Constructs the entity class instance
4. Optionally runs populations based on `FetchOptions` flags

```typescript
// Inside EVaultService.fetchVault():
const data = await this.adapter.fetchVaults(chainId, [address])  // → IEVault[]
const vault = new EVault(data[0])                                 // construct entity
if (options?.populateCollaterals) await this.populateCollaterals([vault])
if (options?.populateMarketPrices) await this.populateMarketPrices([vault])
return vault
```

### Cross-service composition

Services depend on other services for populations. These dependencies are wired via setter methods after construction (to avoid circular dependency issues):

```
AccountService  → VaultMetaService  (populate positions with vault entities)
                → PriceService      (populate USD values)

EVaultService   → VaultMetaService  (populate collateral vault entities)
                → PriceService      (populate market prices)
                → RewardsService    (populate reward campaigns)
                → EulerLabelsService (populate labels)

VaultMetaService → EVaultService, EulerEarnService, SecuritizeVaultService
                   (routes vault addresses to the correct typed service)
```

See [Cross-Service Data Population](./cross-service-data-population.md) for the full population map and options forwarding.

### VaultMetaService — polymorphic routing

`VaultMetaService` is the orchestration layer that handles multiple vault types transparently. It maps vault addresses to the correct typed service by resolving each vault's type and matching it to a registered service. By default this happens through the V3 resolver endpoint, while the legacy subgraph factory lookup remains available as an alternate adapter. This powers `accountService.fetchAccount()` (resolving mixed vault types on positions) and `vaultMetaService.fetchVault()` (type-agnostic fetch).

## Wiring — `buildEulerSDK()`

`buildEulerSDK()` is the composition root that constructs the full dependency graph:

1. **Core infrastructure** — `ProviderService` (RPC clients), `DeploymentService` (chain addresses), `ABIService`
2. **Adapters** — each constructed with `ProviderService`, `DeploymentService`, and a resolved query decorator
3. **Typed vault services** — `EVaultService`, `EulerEarnService`, `SecuritizeVaultService`, each with their adapter
4. **VaultMetaService** — wraps all vault services
5. **AccountService** — depends on `AccountOnchainAdapter` + `VaultMetaService`
6. **Support services** — `PriceService`, `OracleAdapterService`, `RewardsService`, `EulerLabelsService`, `WalletService`, etc.
7. **Post-construction wiring** — setter-based cross-service injection (`setPriceService`, `setRewardsService`, etc.)

The resolved query decorator is selected as:

1. Consumer-provided `buildQuery`, if present
2. Otherwise the built-in in-memory cache from `queryCacheConfig` (enabled by default with `ttlMs: 5000`)

This means custom query decorators replace the SDK's default cache rather than layering on top of it automatically.

## Flexibility and Customization

The interface-based design makes the SDK highly flexible. Every service and adapter can be swapped, composed, or run in parallel.

### Service overrides

Any service can be replaced at build time:

```typescript
const sdk = await buildEulerSDK({
  rpcUrls: { 1: 'https://...' },
  servicesOverrides: {
    priceService: myCustomPriceService,
    accountService: myCustomAccountService,
  },
})
```

### Custom adapter implementations

Since services depend on adapter **interfaces**, you can provide alternative implementations. For example, a meta adapter for accounts that tries a backend first and falls back to on-chain:

```typescript
class AccountBackendWithFallbackAdapter implements IAccountAdapter {
  constructor(
    private backend: AccountBackendAdapter,
    private onchain: AccountOnchainAdapter,
  ) {}

  async fetchAccount(chainId: number, address: Address) {
    try {
      return await this.backend.fetchAccount(chainId, address)
    } catch {
      return await this.onchain.fetchAccount(chainId, address)
    }
  }
}
```

This pattern works for any adapter interface in the SDK.

### Multiple parallel SDK or service instances

Because services are plain objects with injected dependencies, you can run multiple instances with different configurations simultaneously. Common patterns:

**Separate services for different use cases:**

```typescript
// Vault service with backend adapter + long cache for vault table / stats display
const tableVaultService = new EVaultService(
  backendVaultAdapter,  // backed by cached HTTP API
  deploymentService,
)

// Vault service with fresh on-chain data for portfolio / active position management
const portfolioVaultService = new EVaultService(
  new EVaultOnchainAdapter(providerService, deploymentService, shortCacheBuildQuery),
  deploymentService,
)
```

**Separate SDK instances per chain or context:**

```typescript
const mainnetSdk = await buildEulerSDK({ rpcUrls: { 1: mainnetRpc } })
const baseSdk = await buildEulerSDK({ rpcUrls: { 8453: baseRpc } })
```

**Different cache strategies via `buildQuery`:**

```typescript
// Long cache for static / slow-changing data
const longCacheSdk = await buildEulerSDK({
  rpcUrls,
  buildQuery: buildQueryWithLongStaleTime,
})

// Short cache for real-time data
const realtimeSdk = await buildEulerSDK({
  rpcUrls,
  buildQuery: buildQueryWithShortStaleTime,
})
```

### Extending with custom vault types

Register additional vault services to extend the entity union:

```typescript
type ExtendedVault = VaultEntity | MyCustomVault

const sdk = await buildEulerSDK<ExtendedVault>({
  rpcUrls,
  additionalVaultServices: [
    { type: 'MyCustomVault', service: myCustomVaultService },
  ],
})
```

The custom type flows through `VaultMetaService`, `AccountService`, and all population paths via generics.

## End-to-End Data Flow

Putting it all together — fetching an account with full resolution:

```
accountService.fetchAccount(chainId, owner, { populateVaults: true, populateMarketPrices: true })
  │
  ├─ AccountVaultsSubgraphAdapter.queryAccountVaults()       ← subgraph
  │    → list of vault addresses per sub-account
  │
  ├─ AccountOnchainAdapter.queryEVCAccountInfo()             ← RPC (AccountLens)
  ├─ AccountOnchainAdapter.queryVaultAccountInfo() × N       ← RPC (AccountLens)
  │    → convertToSubAccount() → IAccount
  │    → new Account(data)
  │
  ├─ account.populateVaults(vaultMetaService)
  │    ├─ VaultTypeSubgraphAdapter.queryVaultFactories()     ← subgraph
  │    │    → route addresses to correct services
  │    ├─ EVaultOnchainAdapter.queryEVaultInfoFull()          ← RPC (VaultLens)
  │    ├─ EulerEarnOnchainAdapter.queryEulerEarnVaultInfoFull() ← RPC
  │    ├─ EulerEarnOnchainAdapter.queryEulerEarnConvertToAssets() ← RPC
  │    ├─ EulerEarnOnchainAdapter.queryBlockNumber() / queryBlock() ← RPC
  │    │    → convert, construct typed entities
  │    └─ assign vault entities to position.vault fields
  │
  └─ account.populateMarketPrices(priceService)
       ├─ PricingBackendClient.queryBackendPrice()            ← HTTP (backend, bundled)
       │   or PriceService.queryAssetPriceInfo()              ← RPC (fallback)
       └─ set marketPriceUsd on each vault
            → computed getters (healthFactor, netValueUsd, ...) now resolve
```
