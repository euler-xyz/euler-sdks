# Cross-Service Data Population

Services in the SDK follow a standardized **populate** pattern for cross-service data augmentation. When one service's entity needs data from another service, this is called a **population**.

## Rules

1. **Service-level populate method** — For every population there is a public `populateX(entities[])` method on the service that takes an array of basic entities and mutates them in-place.

2. **FetchOptions flag** — For every population there is a `populateX?: boolean` flag in the service's fetch options. Default is `false`.
3. **Global override** — Every fetch-options object also supports `populateAll?: boolean`. When `true`, all supported `populateX` steps for that service are enabled and granular flags are ignored.

4. **Nested options for forwarding** — When a service forwards options to another service, level-2 flags are grouped in a nested object named after the target service's fetch options type (e.g. `eVaultFetchOptions`).

5. **Entity-level populate method** — Every entity that can be populated exposes a `populateX(requiredService)` async method that fetches data from the given service, mutates itself, and returns `DataIssue[]`.
6. **Population state flags** — Populatable entities expose a `populated` object. Each population step sets a corresponding boolean flag to indicate that step has run (for example `marketPrices: true`).

## Populated Flags

Use `entity.populated` to check which enrichment stages have been executed.

```typescript
// ERC4626Vault base (also inherited by EVault, EulerEarn, SecuritizeCollateralVault)
interface ERC4626VaultPopulated {
  marketPrices: boolean;
  rewards: boolean;
  intrinsicApy: boolean;
  labels: boolean;
}

interface EVaultPopulated extends ERC4626VaultPopulated {
  collaterals: boolean;
}

interface EulerEarnPopulated extends ERC4626VaultPopulated {
  strategyVaults: boolean;
}

interface AccountPopulated {
  vaults: boolean;
  marketPrices: boolean;
  userRewards: boolean;
}
```

Example:

```typescript
const { result: earn } = await eulerEarnService.fetchVault(chainId, address, {
  populateStrategyVaults: true,
});

earn.populated.strategyVaults; // true
earn.populated.marketPrices;   // false (unless requested/populated separately)
```

## Population Map

| Entity | Population | Service Method | Entity Method | Flag | Augmenting Service |
|---|---|---|---|---|---|
| `Account` | Vault entities | `accountService.populateVaults(accounts[])` | `account.populateVaults(vaultMetaService)` | `populateVaults` | VaultMetaService |
| `EVault` | Collateral vault entities | `eVaultService.populateCollaterals(vaults[])` | `eVault.populateCollaterals(vaultMetaService)` | `populateCollaterals` | VaultMetaService |
| `EVault` | USD market prices | `eVaultService.populateMarketPrices(vaults[])` | `eVault.populateMarketPrices(priceService)` | `populateMarketPrices` | PriceService |
| `EulerEarn` | Strategy vault entities | `eulerEarnService.populateStrategyVaults(earns[])` | `eulerEarn.populateStrategyVaults(eVaultService)` | `populateStrategyVaults` | EVaultService |
| `EulerEarn` | USD market prices | `eulerEarnService.populateMarketPrices(earns[])` | `eulerEarn.populateMarketPrices(priceService)` | `populateMarketPrices` | PriceService |
| `SecuritizeCollateralVault` | USD market prices | `securitizeVaultService.populateMarketPrices(vaults[])` | `vault.populateMarketPrices(priceService)` | `populateMarketPrices` | PriceService |
| `EVault` | Reward campaigns | `eVaultService.populateRewards(vaults[])` | `eVault.populateRewards(rewardsService)` | `populateRewards` | RewardsService |
| `EulerEarn` | Reward campaigns | `eulerEarnService.populateRewards(earns[])` | `eulerEarn.populateRewards(rewardsService)` | `populateRewards` | RewardsService |
| `SecuritizeCollateralVault` | Reward campaigns | `securitizeVaultService.populateRewards(vaults[])` | `vault.populateRewards(rewardsService)` | `populateRewards` | RewardsService |
| `EVault` | Intrinsic APY | `eVaultService.populateIntrinsicApy(vaults[])` | `eVault.populateIntrinsicApy(intrinsicApyService)` | `populateIntrinsicApy` | IntrinsicApyService |
| `EulerEarn` | Intrinsic APY | `eulerEarnService.populateIntrinsicApy(earns[])` | `eulerEarn.populateIntrinsicApy(intrinsicApyService)` | `populateIntrinsicApy` | IntrinsicApyService |
| `SecuritizeCollateralVault` | Intrinsic APY | `securitizeVaultService.populateIntrinsicApy(vaults[])` | `vault.populateIntrinsicApy(intrinsicApyService)` | `populateIntrinsicApy` | IntrinsicApyService |
| `EVault` | Labels | `eVaultService.populateLabels(vaults[])` | `eVault.populateLabels(eulerLabelsService)` | `populateLabels` | EulerLabelsService |
| `EulerEarn` | Labels | `eulerEarnService.populateLabels(earns[])` | `eulerEarn.populateLabels(eulerLabelsService)` | `populateLabels` | EulerLabelsService |
| `SecuritizeCollateralVault` | Labels | `securitizeVaultService.populateLabels(vaults[])` | `vault.populateLabels(eulerLabelsService)` | `populateLabels` | EulerLabelsService |
| `Account` | USD market prices | `account.populateMarketPrices(priceService)` | `account.populateMarketPrices(priceService)` | `populateMarketPrices` | PriceService |
| `Account` | User rewards | `account.populateUserRewards(rewardsService)` | `account.populateUserRewards(rewardsService)` | `populateUserRewards` | RewardsService |

## FetchOptions Per Service

### VaultFetchOptions (base — used by VaultMetaService)

```typescript
interface VaultFetchOptions {
  populateAll?: boolean;
  populateMarketPrices?: boolean;
  populateCollaterals?: boolean;     // EVault-specific, ignored by other vault services
  populateStrategyVaults?: boolean;  // EulerEarn-specific, ignored by other vault services
  populateRewards?: boolean;
  populateIntrinsicApy?: boolean;
  populateLabels?: boolean;
  eVaultFetchOptions?: EVaultFetchOptions;  // Forwarded to EVaultService by EulerEarnService
}
```

### EVaultFetchOptions

```typescript
interface EVaultFetchOptions {
  populateAll?: boolean;
  populateCollaterals?: boolean;
  populateMarketPrices?: boolean;
  populateRewards?: boolean;
  populateIntrinsicApy?: boolean;
  populateLabels?: boolean;
}
```

### EulerEarnFetchOptions

```typescript
interface EulerEarnFetchOptions {
  populateAll?: boolean;
  populateStrategyVaults?: boolean;
  populateMarketPrices?: boolean;
  populateRewards?: boolean;
  populateIntrinsicApy?: boolean;
  populateLabels?: boolean;
  eVaultFetchOptions?: EVaultFetchOptions;  // Forwarded to EVaultService when populating strategies
}
```

### AccountFetchOptions

```typescript
interface AccountFetchOptions {
  populateAll?: boolean;
  populateVaults?: boolean;
  populateMarketPrices?: boolean;
  populateUserRewards?: boolean;
  vaultFetchOptions?: VaultFetchOptions;  // Forwarded to vault services
}
```

## Usage Examples

### Via fetch options (declarative)

```typescript
// Account with fully resolved vaults, prices, and strategy collaterals
const { result: account } = await accountService.fetchAccount(chainId, address, {
  populateAll: true,
  vaultFetchOptions: {
    populateAll: true,
  },
});

// EVault with collaterals and prices
const { result: vault } = await eVaultService.fetchVault(chainId, address, {
  populateAll: true,
});

// EulerEarn with strategy vaults and collaterals on strategies
const { result: earn } = await eulerEarnService.fetchVault(chainId, address, {
  populateAll: true,
});
```

### Via service populate methods (imperative, batch)

```typescript
// Fetch basic vaults, then populate in bulk
const { result: vaults, errors: fetchErrors } = await eVaultService.fetchVaults(chainId, addresses);
const resolvedVaults = vaults.filter((v) => v !== undefined);
const collateralIssues = await eVaultService.populateCollaterals(resolvedVaults);
const marketIssues = await eVaultService.populateMarketPrices(resolvedVaults);
// `vaults` preserves input order and may contain `undefined` for per-vault failures.
// Use `fetchErrors` + `entityId` to map failures back to requested addresses.
```

### Via entity populate methods (imperative, single entity)

```typescript
// Fetch a basic vault, then populate step by step
const { result: vault } = await eVaultService.fetchVault(chainId, address);
const collateralIssues = await vault.populateCollaterals(vaultMetaService);
const marketIssues = await vault.populateMarketPrices(priceService);

// EulerEarn: populate strategies, then market price
const { result: earn } = await eulerEarnService.fetchVault(chainId, address);
const strategyIssues = await earn.populateStrategyVaults(eVaultService);
const marketIssues = await earn.populateMarketPrices(priceService);

// Account: populate vaults
const { result: account } = await accountService.fetchAccount(chainId, address, { populateVaults: false });
const vaultIssues = await account.populateVaults(vaultMetaService);
```

## Options Forwarding

When `AccountFetchOptions.populateVaults` is true, `vaultFetchOptions` is forwarded as `VaultFetchOptions` to vault services through VaultMetaService:

```
AccountFetchOptions
  ├─ populateVaults              → triggers VaultMetaService.fetchVaults()
  └─ vaultFetchOptions           → forwarded as VaultFetchOptions
       ├─ populateCollaterals    → EVaultService
       ├─ populateMarketPrices   → all vault services
       ├─ populateStrategyVaults → EulerEarnService
       ├─ populateRewards        → all vault services
       ├─ populateIntrinsicApy   → all vault services
       ├─ populateLabels         → all vault services
       └─ eVaultFetchOptions     → EulerEarnService → EVaultService (for strategy vaults)
```

Similarly, `EulerEarnFetchOptions.eVaultFetchOptions` is forwarded to EVaultService when fetching strategy vaults.

## Dependency Graph

```
PriceService          RewardsService
  ↓ (populateMarketPrices)  ↓ (populateRewards)
EVaultService ←→ VaultMetaService ← AccountService
  ↑ (populateCollaterals)         (populateVaults)
  │
EulerEarnService
  (populateStrategyVaults)
```
