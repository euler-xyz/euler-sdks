# Pricing System Architecture

This document describes the pricing system in the Euler V2 SDK, including how prices are fetched, converted to USD, and how different vault types are handled.

> **Important:** Market prices (`marketPriceUsd`) are intended for display purposes only. When the V3 price is unavailable, the SDK falls back to on-chain oracle prices, which may intentionally differ from true market prices for risk management reasons (e.g. fixed or capped prices set by governance). Do not use these values for on-chain risk calculations — use the oracle-based risk prices (`assetRiskPrice`, `getCollateralRiskPrice`) instead.

## Overview

The pricing system provides three access patterns:

1. **Fetch options** (recommended) — Pass `{ populateMarketPrices: true }` when fetching vaults to auto-populate `marketPriceUsd` on entities and collaterals.
2. **Vault helpers** — Methods directly on vault entities (`EVault`, `ERC4626Vault`) for getting risk prices and USD market prices on-demand.
3. **PriceService** (advanced) — The underlying `sdk.priceService` with full access to raw oracle data, USD conversion, value calculation, and display formatting.

## Fetch Options (Auto-Populated Prices)

The simplest way to get USD prices is via fetch options on vault services. This populates `marketPriceUsd` directly on entities.

All vault services (`eVaultService`, `eulerEarnService`, `securitizeVaultService`) accept:

```typescript
interface VaultFetchOptions {
  populateMarketPrices?: boolean  // Populate marketPriceUsd on vault entities
}
```

`eVaultService` extends this with collateral price population:

```typescript
interface EVaultFetchOptions {
  populateCollaterals?: boolean   // Resolve collateral vault entities
  populateMarketPrices?: boolean  // Populate marketPriceUsd on vault AND collaterals
}
```

When `populateMarketPrices` is set, the service populates:
- `vault.marketPriceUsd` — Asset USD price (on `ERC4626Vault`, inherited by all vault types)
- `collateral.marketPriceUsd` — Collateral USD price (on `EVaultCollateral`, requires `populateCollaterals`)

```typescript
// EVault with prices and collateral prices
const { result: vault } = await sdk.eVaultService.fetchVault(1, '0x...', {
  populateCollaterals: true,
  populateMarketPrices: true,
})

vault.marketPriceUsd               // => 1 ($1.00)
vault.collaterals[0].marketPriceUsd // => 2500 ($2500.00)

// EulerEarn / Securitize with prices
const { result: ee } = await sdk.eulerEarnService.fetchVault(1, '0x...', { populateMarketPrices: true })
ee.marketPriceUsd  // => number
```

## Vault Price Helpers

The vault entities provide direct access to pricing through methods and properties for on-demand use.

### Types

```typescript
/** USD price per whole token as a plain decimal number. */
type PriceUsd = number

type RiskPrice = {
  priceLiquidation: bigint  // Mid oracle price, scaled to 18 decimals
  priceBorrowing: bigint    // Ask (asset) or bid (collateral) oracle price, scaled to 18 decimals
}
```

USD market prices and USD values are plain `number` values. Risk prices are read directly from oracle data and remain `bigint` values scaled to 18 decimals.

### EVault Helpers

**Risk prices** — synchronous, read directly from vault oracle data, scaled to 18 decimals:

- **`vault.assetRiskPrice`** — Asset price as `RiskPrice`. Maps oracle mid to `priceLiquidation`, oracle ask to `priceBorrowing`.
- **`vault.getCollateralRiskPrice(collateralVault)`** — Collateral asset price as `RiskPrice`. Converts from share price using `totalShares/totalAssets`. Maps oracle mid to `priceLiquidation`, oracle bid to `priceBorrowing`.

**USD market prices** — async, tries the V3 pricing API first, falls back to on-chain. Returns `number`:

- **`vault.fetchUnitOfAccountMarketPriceUsd(priceService)`** — UoA -> USD rate.
- **`vault.fetchAssetMarketPriceUsd(priceService)`** — Asset USD price.
- **`vault.fetchCollateralMarketPriceUsd(collateralVault, priceService)`** — Collateral USD price.

**USD market values** — async, amount x price as `number`:

- **`vault.fetchAssetMarketValueUsd(amount, priceService)`** — USD value of an asset amount. Inherited from `ERC4626Vault`.
- **`vault.fetchCollateralMarketValueUsd(amount, collateralVault, priceService)`** — USD value of a collateral amount in this vault's context.

### ERC4626Vault Helpers

- **`vault.fetchAssetMarketPriceUsd(priceService)`** — Asset USD price as `number`. Works for any vault type (EVault, EulerEarn, Securitize).
- **`vault.fetchAssetMarketValueUsd(amount, priceService)`** — USD value of an asset amount as `number`.

### Usage Example

```typescript
import { buildEulerSDK } from '@eulerxyz/euler-v2-sdk'

const sdk = await buildEulerSDK({
  pricingServiceConfig: {
    endpoint: 'https://v3.eul.dev',
  },
})

// Option 1: Auto-populated prices via fetch options (recommended)
const { result: vault } = await sdk.eVaultService.fetchVault(1, '0x...', {
  populateCollaterals: true,
  populateMarketPrices: true,
})
vault.marketPriceUsd                 // already populated
vault.collaterals[0].marketPriceUsd  // already populated

// Option 2: On-demand price helpers
const { result: vault2 } = await sdk.eVaultService.fetchVault(1, '0x...')

// Risk prices (sync — from oracle data, 18-decimal bigint)
const assetRisk = vault2.assetRiskPrice
// => { priceLiquidation: 1000000000000000000n, priceBorrowing: 1000100000000000000n }

const { result: collateralVault } = await sdk.eVaultService.fetchVault(1, '0x...')
const collateralRisk = vault2.getCollateralRiskPrice(collateralVault)

// USD market prices (async, number)
const assetUsd = await vault2.fetchAssetMarketPriceUsd(sdk.priceService)
const collateralUsd = await vault2.fetchCollateralMarketPriceUsd(collateralVault, sdk.priceService)

// USD market values (async, number)
const assetValue = await vault2.fetchAssetMarketValueUsd(1000000n, sdk.priceService)
```

### Display Formatting

`formatAssetValue` is a best-effort formatting helper for UI display. It tries to convert an asset amount to a USD value, but when no USD price is available it falls back to showing the raw token amount with its symbol. This means callers always get a displayable result without having to handle the "no price" case themselves.

```typescript
const result = await sdk.priceService.formatAssetValue(amount, vault)
```

**When a USD price is found** (`hasPrice: true`):
- `usdValue` contains the computed USD value (e.g. `1234.56`)
- `display` is empty — the caller is expected to format the USD value for their UI (e.g. `"$1,234.56"`)

```typescript
// { display: "", hasPrice: true, usdValue: 1234.56, assetAmount: 1234.56, assetSymbol: "USDC" }
```

**When no USD price is available** (`hasPrice: false`):
- `display` contains the raw token amount with symbol as a ready-to-use fallback (e.g. `"1,234.56 USDC"`)
- `usdValue` is `0`

```typescript
// { display: "1,234.56 USDC", hasPrice: false, usdValue: 0, assetAmount: 1234.56, assetSymbol: "USDC" }
```

The typical pattern:

```typescript
const result = await sdk.priceService.formatAssetValue(amount, vault)
const text = result.hasPrice
  ? `$${result.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  : result.display
```

```typescript
type FormattedAssetValue = {
  display: string       // Fallback string ("1,234.56 USDC") when no price, empty when price available
  hasPrice: boolean     // Whether a USD price was found
  usdValue: number      // USD value (0 when no price)
  assetAmount: number   // Human-readable token amount
  assetSymbol: string   // Token symbol
}
```

## PriceService (Advanced)

The `PriceService` (`sdk.priceService`) provides the full pricing API. The vault helpers above delegate to these methods internally.

### Price Sources: V3 API + On-Chain Fallback

All USD pricing functions automatically try the **V3 pricing API** first, then fall back to **on-chain** oracle data. There is no `source` parameter - the behavior is always: V3 API first, on-chain fallback.

Layer 1 functions (oracle prices) are always **synchronous** reads from on-chain vault data.

`PriceService` is built with the default V3 pricing endpoint. Override it with `pricingServiceConfig`, `config.pricingApiUrl`, `config.pricingApiKey`, `EULER_SDK_PRICING_API_URL`, or `EULER_SDK_PRICING_API_KEY` when a different endpoint or API key is required.

### Architecture: 2-Layer System

```
+-------------------------------------------------------------+
|                   Layer 2: USD Prices                        |
|        fetchAssetUsdPrice(), fetchCollateralUsdPrice()          |
|                                                              |
|   Always: try V3 pricing API first, fall back to on-chain. |
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
|    fetchUnitOfAccountUsdRate()                                |
|                                                              |
|   Sources:                                                   |
|   - EVault.oraclePriceRaw         (asset price in UoA)      |
|   - EVault.collaterals[].oraclePriceRaw (collateral in UoA) |
|   - utilsLens.getAssetPriceInfo   (UoA->USD conversion)     |
+-------------------------------------------------------------+
```

### Price Types

```typescript
type PriceResult = number

type OraclePriceResult = {
  amountOutMid: bigint  // Mid price
  amountOutAsk: bigint  // Ask price (or mid if unavailable)
  amountOutBid: bigint  // Bid price (or mid if unavailable)
  decimals: number      // Decimals of the quote (output) asset
}
```

`OraclePriceResult.decimals` indicates the precision of raw oracle amounts. `PriceResult` is the USD price per whole token as a plain number.

### Layer 1: Raw Oracle Prices

These are **synchronous** — they read directly from vault entity data.

- **`getAssetOraclePrice(vault: EVault)`** — Returns the vault's asset price in its unit of account from `oraclePriceRaw`
- **`getCollateralOraclePrice(liabilityVault: EVault, collateralVault: ERC4626Vault)`** — Returns collateral asset price in the liability vault's unit of account, converting from share price to asset price using `totalShares/totalAssets`
- **`getCollateralShareOraclePrice(liabilityVault: EVault, collateralVault: ERC4626Vault)`** — Returns raw collateral share price (before share-to-asset conversion)

### UoA -> USD Rate

- **`fetchUnitOfAccountUsdRate(vault: EVault)`** — Returns the UoA -> USD conversion rate (async)
  - If `unitOfAccount.address === USD_ADDRESS` (`0x...0348`), returns `1`
  - Always tries the V3 pricing API first, falls back to on-chain `utilsLens.getAssetPriceInfo(unitOfAccount, USD_ADDRESS)`

### Layer 2: USD Prices

These are **async** — they try the V3 pricing API first, then fall back to on-chain.

- **`fetchAssetUsdPrice(vault: ERC4626Vault)`** — Routes based on vault type:
  - `EVault`: `oraclePriceRaw * uoaRate`
  - `EulerEarn` / `SecuritizeCollateralVault`: `utilsLens.getAssetPriceInfo(asset, USD_ADDRESS)`
  - Tries the V3 pricing API first for direct asset USD price

- **`fetchCollateralUsdPrice(liabilityVault: EVault, collateralVault: ERC4626Vault)`** — Collateral price in USD using the liability vault's oracle and UoA rate
  - Tries the V3 pricing API with collateral asset address first

## USD Price Calculation for EVault

```
fetchAssetUsdPrice(vault):
  1. If a V3 pricing endpoint is configured:
     - Try the V3 pricing API for direct asset USD price
     - If available, return the V3 price

  2. Oracle calculation (fallback):
     a. oraclePrice = vault.oraclePriceRaw   // Always on-chain
     b. uoaRate = await fetchUnitOfAccountUsdRate(vault)
        - Always tries the V3 pricing API first, falls back to utilsLens call
        - Returns 1 if vault.unitOfAccount.address === USD_ADDRESS
     c. return decimal(oraclePrice) * uoaRate
```

For escrow vaults (EVaults with `unitOfAccount === USD_ADDRESS`), the UoA rate is `1`, so `oraclePriceRaw` is converted directly into a USD number.

## Collateral Price Calculation

**Key principle: Collateral prices are ALWAYS from the liability vault's perspective.**

When vault A (liability) accepts vault B (collateral), the price of B is determined by vault A's oracle router, NOT vault B's own oracle.

```
fetchCollateralUsdPrice(liabilityVault, collateralVault):
  1. If a V3 pricing endpoint is configured:
     - Try the V3 pricing API for direct collateral USD price
     - If available, return the V3 price

  2. Oracle calculation (fallback):
     a. sharePrice = liabilityVault.collaterals.find(collateralVault.address).oraclePriceRaw
     b. assetPrice = sharePrice * (totalShares / totalAssets)
        // Special case: if totalAssets=0 AND totalShares=0 (empty vault),
        // ERC-4626 standard defines 1:1 ratio, so use sharePrice directly
     c. uoaRate = await fetchUnitOfAccountUsdRate(liabilityVault)
        // Use LIABILITY's UoA - always tries the V3 pricing API first
     d. return decimal(assetPrice) * uoaRate
```

## Vault Type Routing

| Vault Type | SDK Entity | Price Source | Notes |
|------------|-----------|--------------|-------|
| Regular EVK | `EVault` | `oraclePriceRaw` + UoA conversion | Standard oracle-based pricing |
| Escrow EVK | `EVault` | `oraclePriceRaw` + UoA conversion | UoA is USD so rate=1 |
| Euler Earn | `EulerEarn` | `utilsLens.getAssetPriceInfo` | Direct USD price fetched on-demand |
| Securitize | `SecuritizeCollateralVault` | `utilsLens.getAssetPriceInfo` | Direct USD price fetched on-demand |

Detection uses the vault's `type` field (checked against `VaultType.EVault`).

## Type Mapping

| Role | SDK Type | Notes |
|------|----------|-------|
| Liability vault | `EVault` | Always an EVault |
| Collateral / any vault | `ERC4626Vault` | Base class of `EVault`, `EulerEarn`, `SecuritizeCollateralVault` |

Key field mappings:

| Data | SDK Location | Description |
|------|-------------|-------------|
| Liability price | `EVault.oraclePriceRaw` | Asset price in vault's unit of account (from VaultLens) |
| Collateral prices | `EVault.collaterals[i].oraclePriceRaw` | Collateral prices from liability vault's perspective |
| Vault USD price | `vault.marketPriceUsd` | Set by `populateMarketPrices` option or via `fetchAssetMarketPriceUsd()` |
| Collateral USD price | `collateral.marketPriceUsd` | Set by `populateMarketPrices` option (requires `populateCollaterals`) |

## Pyth Oracle Handling

Pyth oracles require explicit on-chain price updates before they can be queried. When the on-chain Pyth price is stale (past `maxStaleness`), lens queries return `queryFailure: true`.

The SDK provides utilities for working with Pyth oracles in `utils/oracle.ts`:

- **`collectPythFeedIds(oracleInfo)`** — Recursively extracts all Pyth feed IDs from an oracle configuration (traverses EulerRouter, CrossAdapter, and PythOracle nodes)
- **`collectChainlinkOracles(oracleInfo)`** — Collects Chainlink oracle addresses

Pyth price update simulation is handled by `createPythPlugin()` on SDK read paths, where the plugin prepends update calls to lens `batchSimulation`. On write paths, `executionService.simulateTransactionPlan`, `executionService.estimateGasForTransactionPlan`, and `executionService.executeTransactionPlan` apply the Pyth plugin before running the plan.

## Pricing API Client Implementation

The `PricingBackendClient` (`services/priceService/backendClient.ts`) provides price fetching with automatic optimizations:

**API Endpoint:**
- URL: `GET /v3/prices?chainId={chainId}&assets={addr1},{addr2},...`
- Response: `Record<string, BackendPriceData>` keyed by lowercase address

**Request Batching:**
- Concurrent calls are bundled per microtask and grouped by chainId (addresses deduplicated per request)

**Key Functions:**
- `queryV3Price({ address, chainId })` — Single-key query API with automatic bundling
- `normalizeBackendPrice(price)` — Normalize backend prices to positive finite USD numbers

## Design Principles

1. **Fetch options for convenience** — Pass `{ populateMarketPrices: true }` to auto-populate `marketPriceUsd` on entities during fetch
2. **V3 API first, on-chain fallback** — All USD pricing tries the V3 pricing API automatically, with on-chain as fallback
3. **Collateral prices from liability vault's perspective** — Collateral is always priced using the liability vault's oracle router
4. **No hardcoded fallbacks** — If a price cannot be determined, return `undefined` rather than assuming values
5. **Vault type awareness** — Different vault types route to appropriate price sources
6. **Positive finite market prices** — USD market prices are returned when a positive finite price can be resolved; missing or unusable sources return `undefined`
7. **Graceful degradation** — Price population uses `.catch(() => undefined)` per entity, so a single failure doesn't break the batch

## Files

- `entities/ERC4626Vault.ts` — `PriceUsd` type, `marketPriceUsd` property, `fetchAssetMarketPriceUsd()`, `fetchAssetMarketValueUsd()`
- `entities/EVault.ts` — `RiskPrice` type, `EVaultCollateral.marketPriceUsd`, `assetRiskPrice`, `getCollateralRiskPrice()`, `fetchCollateralMarketPriceUsd()`, `fetchCollateralMarketValueUsd()`
- `services/vaults/IVaultService.ts` — `VaultFetchOptions { populateMarketPrices }` base interface
- `services/vaults/eVaultService/eVaultService.ts` — `EVaultFetchOptions`, price population
- `services/vaults/eulerEarnService/eulerEarnService.ts` — Market price population
- `services/vaults/securitizeVaultService/securitizeVaultService.ts` — Market price population
- `services/priceService/priceService.ts` — Core pricing functions, `IPriceService`, `formatAssetValue()`
- `services/priceService/backendClient.ts` — V3 pricing API client with bundled requests
- `services/priceService/index.ts` — Public exports
- `utils/oracle.ts` — Oracle decoding and Pyth/Chainlink feed collection
- `examples/vaults/fetch-vault-details-example.ts` — Example with resolved collaterals and market prices
