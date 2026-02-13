# Cross-Service Data Population

Services in the SDK follow a standardized **populate** pattern for cross-service data augmentation. When one service's entity needs data from another service, this is called a **population**.

## Rules

1. **Service-level populate method** — For every population there is a public `populateX(entities[])` method on the service that takes an array of basic entities and mutates them in-place.

2. **FetchOptions flag** — For every population there is a `populateX?: boolean` flag in the service's fetch options. Default is `false`.

3. **Two-level propagation** — If the augmenting service has its own populate flags, they are surfaced as flags on the parent service's fetch options. Maximum depth is 2 levels (parent → child augmentations, no deeper).

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

## FetchOptions Per Service

### VaultFetchOptions (base — used by VaultMetaService)

```typescript
interface VaultFetchOptions {
  populateMarketPrices?: boolean;
  populateCollaterals?: boolean;     // EVault-specific, ignored by other vault services
  populateStrategyVaults?: boolean;  // EulerEarn-specific, ignored by other vault services
}
```

### EVaultFetchOptions

```typescript
interface EVaultFetchOptions {
  populateCollaterals?: boolean;   // Resolve collateral vault entities
  populateMarketPrices?: boolean;  // Resolve USD prices for vault asset and collaterals
}
```

### EulerEarnFetchOptions

```typescript
interface EulerEarnFetchOptions {
  populateStrategyVaults?: boolean;  // Resolve strategy EVault entities
  populateMarketPrices?: boolean;    // Resolve USD price for the vault asset
  populateCollaterals?: boolean;     // Level 2: resolve collaterals on strategy EVaults
}
```

### AccountFetchOptions

```typescript
interface AccountFetchOptions {
  populateVaults?: boolean;           // Resolve vault entities in positions and liquidity
  populateCollaterals?: boolean;      // Level 2: resolve collaterals on EVaults
  populateMarketPrices?: boolean;     // Level 2: resolve USD prices on vaults
  populateStrategyVaults?: boolean;   // Level 2: resolve strategy vaults on EulerEarn
}
```

## Usage Examples

### Via fetch options (declarative)

```typescript
// Account with fully resolved vaults and prices
const account = await accountService.fetchAccount(chainId, address, {
  populateVaults: true,
  populateMarketPrices: true,
  populateCollaterals: true,
});

// EVault with collaterals and prices
const vault = await eVaultService.fetchVault(chainId, address, {
  populateCollaterals: true,
  populateMarketPrices: true,
});

// EulerEarn with strategy vaults (needed for supplyApy)
const earn = await eulerEarnService.fetchVault(chainId, address, {
  populateStrategyVaults: true,
  populateMarketPrices: true,
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

## Two-Level Propagation

When `AccountFetchOptions.populateVaults` is true, level-2 flags are forwarded as `VaultFetchOptions` to the vault services through VaultMetaService. Each service picks up the flags it cares about:

```
AccountFetchOptions
  ├─ populateVaults          → triggers VaultMetaService.fetchVaults()
  ├─ populateCollaterals     → forwarded as VaultFetchOptions.populateCollaterals  → EVaultService
  ├─ populateMarketPrices    → forwarded as VaultFetchOptions.populateMarketPrices → all vault services
  └─ populateStrategyVaults  → forwarded as VaultFetchOptions.populateStrategyVaults → EulerEarnService
```

Similarly, `EulerEarnFetchOptions.populateCollaterals` is forwarded to EVaultService when fetching strategy vaults.

## Dependency Graph

```
PriceService
  ↓ (populateMarketPrices)
EVaultService ←→ VaultMetaService ← AccountService
  ↑ (populateCollaterals)         (populateVaults)
  │
EulerEarnService
  (populateStrategyVaults)
```
