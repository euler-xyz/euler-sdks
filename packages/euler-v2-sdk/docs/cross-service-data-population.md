# Cross-Service Data Population

Services in the SDK follow a standardized **populate** pattern for cross-service data augmentation. When one service's entity needs data from another service, this is called a **population**.

## Rules

1. **Service-level populate method** — For every population there is a public `populateX(entities[])` method on the service that takes an array of basic entities and mutates them in-place.

2. **FetchOptions flag** — For every population there is a `populateX?: boolean` flag in the service's fetch options. Default is `false`.

3. **Nested options for forwarding** — When a service forwards options to another service, level-2 flags are grouped in a nested object named after the target service's fetch options type (e.g. `eVaultFetchOptions`).

4. **Entity-level populate method** — Every entity that can be populated exposes a `populateX(requiredService)` async method that fetches data from the given service and mutates itself.

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

## FetchOptions Per Service

### VaultFetchOptions (base — used by VaultMetaService)

```typescript
interface VaultFetchOptions {
  populateMarketPrices?: boolean;
  populateCollaterals?: boolean;     // EVault-specific, ignored by other vault services
  populateStrategyVaults?: boolean;  // EulerEarn-specific, ignored by other vault services
  populateRewards?: boolean;
  eVaultFetchOptions?: EVaultFetchOptions;  // Forwarded to EVaultService by EulerEarnService
}
```

### EVaultFetchOptions

```typescript
interface EVaultFetchOptions {
  populateCollaterals?: boolean;
  populateMarketPrices?: boolean;
  populateRewards?: boolean;
}
```

### EulerEarnFetchOptions

```typescript
interface EulerEarnFetchOptions {
  populateStrategyVaults?: boolean;
  populateMarketPrices?: boolean;
  populateRewards?: boolean;
  eVaultFetchOptions?: EVaultFetchOptions;  // Forwarded to EVaultService when populating strategies
}
```

### AccountFetchOptions

```typescript
interface AccountFetchOptions {
  populateVaults?: boolean;
  vaultFetchOptions?: VaultFetchOptions;  // Forwarded to vault services
}
```

## Usage Examples

### Via fetch options (declarative)

```typescript
// Account with fully resolved vaults, prices, and strategy collaterals
const account = await accountService.fetchAccount(chainId, address, {
  vaultFetchOptions: {
    populateMarketPrices: true,
    populateCollaterals: true,
    populateStrategyVaults: true,
    populateRewards: true,
    eVaultFetchOptions: { populateCollaterals: true },
  },
});

// EVault with collaterals and prices
const vault = await eVaultService.fetchVault(chainId, address, {
  populateCollaterals: true,
  populateMarketPrices: true,
});

// EulerEarn with strategy vaults and collaterals on strategies
const earn = await eulerEarnService.fetchVault(chainId, address, {
  populateStrategyVaults: true,
  populateMarketPrices: true,
  eVaultFetchOptions: { populateCollaterals: true },
});
```

### Via service populate methods (imperative, batch)

```typescript
// Fetch basic vaults, then populate in bulk
const vaults = await eVaultService.fetchVaults(chainId, addresses);
await eVaultService.populateCollaterals(vaults);
await eVaultService.populateMarketPrices(vaults);
```

### Via entity populate methods (imperative, single entity)

```typescript
// Fetch a basic vault, then populate step by step
const vault = await eVaultService.fetchVault(chainId, address);
await vault.populateCollaterals(vaultMetaService);
await vault.populateMarketPrices(priceService);

// EulerEarn: populate strategies, then market price
const earn = await eulerEarnService.fetchVault(chainId, address);
await earn.populateStrategyVaults(eVaultService);
await earn.populateMarketPrices(priceService);

// Account: populate vaults
const account = await accountService.fetchAccount(chainId, address, { populateVaults: false });
await account.populateVaults(vaultMetaService);
```

## Options Forwarding

When `AccountFetchOptions.populateVaults` is true (default), `vaultFetchOptions` is forwarded as `VaultFetchOptions` to vault services through VaultMetaService:

```
AccountFetchOptions
  ├─ populateVaults              → triggers VaultMetaService.fetchVaults()
  └─ vaultFetchOptions           → forwarded as VaultFetchOptions
       ├─ populateCollaterals    → EVaultService
       ├─ populateMarketPrices   → all vault services
       ├─ populateStrategyVaults → EulerEarnService
       ├─ populateRewards        → all vault services
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
