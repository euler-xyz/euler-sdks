# Pricing System Architecture

This document describes the pricing system in the Euler V2 SDK, including how prices are fetched, converted to USD, and how different vault types are handled.

## Overview

The pricing system provides two access patterns:

1. **Vault helpers** (primary) — Methods directly on vault entities (`EVault`, `ERC4626Vault`) for getting risk prices and USD market prices.
2. **PriceService** (advanced) — The underlying `sdk.priceService` with full access to raw oracle data, USD conversion, value calculation, and display formatting.

## Vault Price Helpers

The vault entities provide direct access to pricing through methods and properties. These are the recommended entry point for most use cases.

### Types

```typescript
/** Price scaled to 18 decimals (WAD precision). */
type PriceWad = bigint

type RiskPrice = {
  priceLiquidation: PriceWad  // Mid oracle price, scaled to 18 decimals
  priceBorrowing: PriceWad    // Ask (asset) or bid (collateral) oracle price, scaled to 18 decimals
}
```

All prices are returned as `PriceWad` — a `bigint` always scaled to 18 decimals.

### EVault Helpers

**Risk prices** — synchronous, read directly from vault oracle data, scaled to 18 decimals:

- **`vault.assetRiskPrice`** — Asset price as `RiskPrice`. Maps oracle mid to `priceLiquidation`, oracle ask to `priceBorrowing`.
- **`vault.getCollateralRiskPrice(collateralVault)`** — Collateral asset price as `RiskPrice`. Converts from share price using `totalShares/totalAssets`. Maps oracle mid to `priceLiquidation`, oracle bid to `priceBorrowing`.

**USD market prices** — async, tries backend first, falls back to on-chain. Returns `PriceWad` (18-decimal bigint):

- **`vault.fetchUnitOfAccountMarketPriceUsd(priceService)`** — UoA → USD rate.
- **`vault.fetchAssetMarketPriceUsd(priceService)`** — Asset USD price.
- **`vault.fetchCollateralMarketPriceUsd(collateralVault, priceService)`** — Collateral USD price.

**USD market values** — async, amount × price as 18-decimal bigint:

- **`vault.fetchAssetMarketValueUsd(amount, priceService)`** — USD value of an asset amount. Inherited from `ERC4626Vault`.
- **`vault.fetchCollateralMarketValueUsd(amount, collateralVault, priceService)`** — USD value of a collateral amount in this vault's context.

### ERC4626Vault Helpers

- **`vault.fetchAssetMarketPriceUsd(priceService)`** — Asset USD price as `PriceWad`. Works for any vault type (EVault, EulerEarn, Securitize).
- **`vault.fetchAssetMarketValueUsd(amount, priceService)`** — USD value of an asset amount as 18-decimal bigint.

### Usage Example

```typescript
import { buildSDK } from 'euler-v2-sdk'

const sdk = await buildSDK({
  rpcUrls: { 1: 'https://...' },
  backendConfig: {
    endpoint: 'https://pricing.euler.finance',
    chainId: 1,
  },
})

const vault = await sdk.eVaultService.fetchVault(1, '0x...')

// Risk prices (sync — from oracle data, all PriceWad = 18-decimal bigint)
const assetRisk = vault.assetRiskPrice
// => { priceLiquidation: 1000000000000000000n, priceBorrowing: 1000100000000000000n }

const collateralVault = await sdk.eVaultService.fetchVault(1, '0x...')
const collateralRisk = vault.getCollateralRiskPrice(collateralVault)

// USD market prices (async, PriceWad)
const assetUsd = await vault.fetchAssetMarketPriceUsd(sdk.priceService)
// => 1000000000000000000n  (= $1.00)

const uoaUsd = await vault.fetchUnitOfAccountMarketPriceUsd(sdk.priceService)
const collateralUsd = await vault.fetchCollateralMarketPriceUsd(collateralVault, sdk.priceService)

// USD market values (async, 18-decimal bigint)
const assetValue = await vault.fetchAssetMarketValueUsd(1000000n, sdk.priceService)
// => 1000000000000000000n  ($1.00 for 1 USDC)

const collateralValue = await vault.fetchCollateralMarketValueUsd(
  1000000000000000000n, collateralVault, sdk.priceService
)
```

### Display Formatting

Use `formatAssetValue` on the PriceService to format asset amounts for UI display:

```typescript
const formatted = await sdk.priceService.formatAssetValue(amount, vault)
// => { display: "1,234.56 USDC", hasPrice: true, usdValue: 1234.56, assetAmount: 1234.56, assetSymbol: "USDC" }
```

```typescript
type FormatAssetValueOptions = {
  maxDecimals?: number  // default: 2
  minDecimals?: number  // default: 2
}

type FormattedAssetValue = {
  display: string       // "1,234.56 USDC" when no price, empty when price available
  hasPrice: boolean     // Whether a USD price was found
  usdValue: number      // USD value (0 when no price)
  assetAmount: number   // Human-readable token amount
  assetSymbol: string   // Token symbol
}
```

When `hasPrice` is `true`, `usdValue` contains the USD value and the caller formats the display. When `hasPrice` is `false`, `display` contains a fallback string like `"1,234.56 USDC"`.

## PriceService (Advanced)

The `PriceService` (`sdk.priceService`) provides the full pricing API. The vault helpers above delegate to these methods internally.

### Price Sources: Backend + On-Chain Fallback

All USD pricing functions automatically try the **backend (off-chain)** first, then fall back to **on-chain** oracle data. There is no `source` parameter — the behavior is always: backend first, on-chain fallback.

Layer 1 functions (oracle prices) are always **synchronous** reads from on-chain vault data.

Pass `backendConfig` when building the SDK to enable backend pricing. When `backendConfig` is not provided, all pricing falls back to on-chain oracle data.

### Architecture: 3-Layer System

```
+-------------------------------------------------------------+
|                   Layer 2: USD Prices                        |
|        getAssetUsdPrice(), getCollateralUsdPrice()          |
|                                                              |
|   Always: try backend first, fall back to on-chain.         |
|   Routes based on vault type:                                |
|   - EulerEarn / SecuritizeCollateral                         |
|       -> utilsLens.getAssetPriceInfo(asset, USD)             |
|   - EVault (including escrow)                                |
|       -> oraclePriceRaw * unitOfAccountUsdRate               |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|              Layer 1: Raw Oracle Prices (UoA)               |
|    getAssetOraclePrice(), getCollateralOraclePrice()        |
|    getUnitOfAccountUsdRate()                                |
|                                                              |
|   Sources:                                                   |
|   - EVault.oraclePriceRaw         (asset price in UoA)      |
|   - EVault.collaterals[].oraclePriceRaw (collateral in UoA) |
|   - utilsLens.getAssetPriceInfo   (UoA->USD conversion)     |
+-------------------------------------------------------------+
```

### PriceResult Type

```typescript
type PriceResult = {
  amountOutMid: bigint  // Mid price
  amountOutAsk: bigint  // Ask price (or mid if unavailable)
  amountOutBid: bigint  // Bid price (or mid if unavailable)
  decimals: number      // Decimals of the quote (output) asset
}
```

The `decimals` field indicates the precision of the amounts:
- **Layer 1** (oracle prices): UoA decimals (from `EVault.unitOfAccount.decimals`)
- **Layer 2/3** (USD prices): 18 (USD is represented with 18 decimals)

### Layer 1: Raw Oracle Prices

These are **synchronous** — they read directly from vault entity data.

- **`getAssetOraclePrice(vault: EVault)`** — Returns the vault's asset price in its unit of account from `oraclePriceRaw`
- **`getCollateralOraclePrice(liabilityVault: EVault, collateralVault: ERC4626Vault)`** — Returns collateral asset price in the liability vault's unit of account, converting from share price to asset price using `totalShares/totalAssets`
- **`getCollateralShareOraclePrice(liabilityVault: EVault, collateralVault: ERC4626Vault)`** — Returns raw collateral share price (before share-to-asset conversion)

### UoA -> USD Rate

- **`getUnitOfAccountUsdRate(vault: EVault)`** — Returns the UoA -> USD conversion rate (async)
  - If `unitOfAccount.address === USD_ADDRESS` (`0x...0348`), returns `1e18` (hardcoded)
  - Always tries backend first, falls back to on-chain `utilsLens.getAssetPriceInfo(unitOfAccount, USD_ADDRESS)`

### Layer 2: USD Prices

These are **async** — they try backend first, then fall back to on-chain.

- **`getAssetUsdPrice(vault: ERC4626Vault)`** — Routes based on vault type:
  - `EVault`: `oraclePriceRaw * uoaRate`
  - `EulerEarn` / `SecuritizeCollateralVault`: `utilsLens.getAssetPriceInfo(asset, USD_ADDRESS)`
  - Tries backend first for direct asset USD price

- **`getCollateralUsdPrice(liabilityVault: EVault, collateralVault: ERC4626Vault)`** — Collateral price in USD using the liability vault's oracle and UoA rate
  - Tries backend with collateral asset address first

## Type Mapping

The SDK uses `ERC4626Vault` (the common base class) for vault parameters that accept any vault type, and `EVault` specifically for liability vaults:

| Role | SDK Type | Notes |
|------|----------|-------|
| Liability vault | `EVault` | Always an EVault |
| Collateral / any vault | `ERC4626Vault` | Base class of `EVault`, `EulerEarn`, `SecuritizeCollateralVault` |

Key field mappings from on-chain data:

| Data | SDK Location | Description |
|------|-------------|-------------|
| Liability price | `EVault.oraclePriceRaw` | Asset price in vault's unit of account (from VaultLens) |
| Collateral prices | `EVault.collaterals[i].oraclePriceRaw` | Collateral prices from liability vault's perspective (from VaultLens) |
| UoA -> USD rate | fetched on-demand | `utilsLens.getAssetPriceInfo(unitOfAccount, USD_ADDRESS)` |
| Direct USD price | fetched on-demand | `utilsLens.getAssetPriceInfo(asset, USD_ADDRESS)` (for EulerEarn/Securitize) |

**Note:** Unlike euler-lite which caches `assetPriceInfo` and `unitOfAccountPriceInfo` on the vault entity during loading, the SDK fetches these on-demand via the `PriceService` when needed.

## USD Price Calculation for EVault

```
getAssetUsdPrice(vault):
  1. If backend configured:
     - Try backend for direct asset USD price
     - If available, return backend price

  2. Oracle calculation (fallback):
     a. oraclePrice = vault.oraclePriceRaw   // Always on-chain
     b. uoaRate = await getUnitOfAccountUsdRate(vault)
        - Always tries backend first, falls back to utilsLens call
        - Returns 1e18 if vault.unitOfAccount.address === USD_ADDRESS
     c. return (oraclePrice * uoaRate) / 1e18
```

For escrow vaults (EVaults with `unitOfAccount === USD_ADDRESS`): the UoA rate is `1e18`, so `oraclePriceRaw` is effectively the USD price directly.

## Collateral Price Calculation

**Key principle: Collateral prices are ALWAYS from the liability vault's perspective.**

When vault A (liability) accepts vault B (collateral), the price of B is determined by vault A's oracle router, NOT vault B's own oracle.

```
getCollateralUsdPrice(liabilityVault, collateralVault):
  1. If backend configured:
     - Try backend for direct collateral USD price
     - If available, return backend price

  2. Oracle calculation (fallback):
     a. sharePrice = liabilityVault.collaterals.find(collateralVault.address).oraclePriceRaw
     b. assetPrice = sharePrice * (totalShares / totalAssets)
        // Special case: if totalAssets=0 AND totalShares=0 (empty vault),
        // ERC-4626 standard defines 1:1 ratio, so use sharePrice directly
     c. uoaRate = await getUnitOfAccountUsdRate(liabilityVault)
        // Use LIABILITY's UoA - always tries backend first
     d. return (assetPrice * uoaRate) / 1e18
```

## Vault Type Routing

| Vault Type | SDK Entity | Price Source | Notes |
|------------|-----------|--------------|-------|
| Regular EVK | `EVault` | `oraclePriceRaw` + UoA conversion | Standard oracle-based pricing |
| Escrow EVK | `EVault` | `oraclePriceRaw` + UoA conversion | UoA is USD so rate=1e18 |
| Euler Earn | `EulerEarn` | `utilsLens.getAssetPriceInfo` | Direct USD price fetched on-demand |
| Securitize | `SecuritizeCollateralVault` | `utilsLens.getAssetPriceInfo` | Direct USD price fetched on-demand |

Detection uses the vault's `type` field (checked against `VaultType.EVault`).

## Pyth Oracle Handling

Pyth oracles require explicit on-chain price updates before they can be queried. When the on-chain Pyth price is stale (past `maxStaleness`), lens queries return `queryFailure: true`.

The SDK provides utilities for working with Pyth oracles in `utils/oracle.ts`:

- **`collectPythFeedIds(oracleInfo)`** — Recursively extracts all Pyth feed IDs from an oracle configuration (traverses EulerRouter, CrossAdapter, and PythOracle nodes)
- **`collectChainlinkOracles(oracleInfo)`** — Collects Chainlink oracle addresses

Pyth price update simulation (via EVC `batchSimulation`) is not built into the SDK's PriceService — it is the caller's responsibility to ensure Pyth prices are fresh before reading vault data. The oracle info on `EVault.oracle` contains the full configuration tree needed to identify and update Pyth feeds.

## Backend Client Implementation

The `PricingBackendClient` (`services/priceService/backendClient.ts`) provides price fetching with automatic optimizations:

**Types:**
- `BackendPriceData` — Response shape: `{ address, price: number, source, symbol, timestamp }`
- `BackendPriceResponse` — `Record<string, BackendPriceData>` keyed by lowercase address

**API Endpoint:**
- URL: `GET /v1/prices?chainId={chainId}&assets={addr1},{addr2},...`
- Response: Flat object keyed by lowercase address

**Caching:**
- TTL: 60 seconds
- Key format: `{chainId}:{address.toLowerCase()}`
- Stale entries cleared via `clearStaleCache()`

**Request Batching:**
- 50ms debounce window for `fetchPrice()` calls
- Requests grouped by chainId
- Addresses deduplicated within batch

**Error Handling:**
- Network errors: return cached results if available
- Non-200 responses: fall back to cached results
- Partial failures: return available cached data

**Key Functions:**
- `fetchPrice(address, chainId?)` — Single price with auto-batching
- `fetchPrices(addresses, chainId?)` — Multiple prices in one call
- `backendPriceToBigInt(price)` — Convert to 18-decimal bigint

## Design Principles

1. **Backend first, on-chain fallback** — All USD pricing tries the backend automatically, with on-chain as fallback. No source parameter needed.
2. **Collateral prices from liability vault's perspective** — Collateral is always priced using the liability vault's oracle router
3. **No hardcoded fallbacks** — If a price cannot be determined, return `undefined` rather than assuming values
4. **Layered architecture** — Clear separation between raw oracle data, USD conversion, and value calculation
5. **Vault type awareness** — Different vault types route to appropriate price sources
6. **Empty vault handling** — ERC-4626 empty vaults (totalAssets=0, totalShares=0) use 1:1 share-to-asset ratio per standard
7. **Zero is valid** — A price of `0n` is valid (very small value due to precision); only `undefined`/`null` or `queryFailure` indicate missing prices
8. **On-demand fetching** — UoA->USD rates and direct USD prices are fetched when needed (not pre-cached on entities)

## Files

- `entities/ERC4626Vault.ts` — `PriceWad` type, `fetchAssetMarketPriceUsd()`, `fetchAssetMarketValueUsd()` base methods
- `entities/EVault.ts` — `RiskPrice` type, `assetRiskPrice`, `getCollateralRiskPrice()`, `fetchUnitOfAccountMarketPriceUsd()`, `fetchCollateralMarketPriceUsd()`, `fetchCollateralMarketValueUsd()`
- `services/priceService/priceService.ts` — Core pricing functions, `IPriceService` interface, `formatAssetValue()`, free functions (`getAssetOraclePrice`, `getCollateralOraclePrice`, `getCollateralShareOraclePrice`)
- `services/priceService/backendClient.ts` — Backend API client with batching and caching
- `services/priceService/utilsLensPriceAbi.ts` — ABI for `utilsLens.getAssetPriceInfo`
- `services/priceService/index.ts` — Public exports
- `utils/oracle.ts` — Oracle decoding and Pyth/Chainlink feed collection
