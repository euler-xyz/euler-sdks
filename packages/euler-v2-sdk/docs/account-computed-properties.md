# Account And Portfolio Computed Properties

`Account` and `Portfolio` are two ways to look at the same underlying account data.

`Account` is the lower-level, contract-shaped view: owners, sub-accounts, raw positions, enabled controllers/collaterals, and liquidity structs. `Portfolio` wraps a populated `Account` and provides an opinionated, position-first view: savings, borrows, collateral, portfolio totals, net APY, and ROE.

Computed getters return `undefined` when their prerequisite data has not been populated.

## Population Prerequisites

Computed properties depend on data populated by calling `populateVaults`, `populateMarketPrices`, and `populateUserRewards`. The table below shows which population steps each property requires.

| Population Step | Method | Service | What It Provides |
|---|---|---|---|
| Vaults | `account.populateVaults(vaultMetaService)` | VaultMetaService | Vault entities on positions (APY, asset metadata, IRM) |
| Market Prices | `account.populateMarketPrices(priceService)` | PriceService | `suppliedValueUsd`, `borrowedValueUsd` on positions; `liabilityValueUsd`, `totalCollateralValueUsd` on liquidity |
| Rewards (on vaults) | via `vaultFetchOptions.populateRewards` | RewardsService | `vault.rewards.campaigns` with per-campaign APR |
| User Rewards | `account.populateUserRewards(rewardsService)` | RewardsService | `account.userRewards` (unclaimed reward tokens) |

Typical setup to enable Account-level computed properties and then build a Portfolio:

```typescript
const { result: account } = await accountService.fetchAccount(chainId, owner, {
  populateAll: true,
});

const portfolio = portfolioService.buildPortfolio(account)
```

For a direct high-level read, use `portfolioService.fetchPortfolio(...)`, which always fetches the backing Account with `populateAll: true`.

## SubAccount Properties

| Property | Type | Prerequisites | Description |
|---|---|---|---|
| `healthFactor` | `bigint \| undefined` | Liquidity data (included by default) | `totalCollateralValue.liquidation / liabilityValue.liquidation` (WAD). `> 1e18` = healthy, `< 1e18` = liquidatable. |
| `currentLTV` | `bigint \| undefined` | Liquidity data | `liabilityValue / totalCollateralValue` (WAD). Current loan-to-value ratio. |
| `liquidationLTV` | `bigint \| undefined` | Liquidity data | `totalCollateralValue.liquidation / totalCollateralValue.oracleMid` (WAD). Weighted-average liquidation threshold. |
| `multiplier` | `number \| undefined` | `populateMarketPrices` | `suppliedCollateralValueUsd / (suppliedCollateralValueUsd - borrowedValueUsd)`. Leverage multiplier (`1` = 1x). |
| `totalCollateralValueUsd` | `number \| undefined` | `populateMarketPrices` | Total collateral value in USD from sub-account liquidity. |
| `liabilityValueUsd` | `number \| undefined` | `populateMarketPrices` | Liability value in USD from sub-account liquidity. |
| `netValueUsd` | `number \| undefined` | `populateMarketPrices` | `sum(suppliedValueUsd) - sum(borrowedValueUsd)`. Net asset value in USD. |
| `roe` | `SubAccountRoe \| undefined` | `populateVaults` + `populateMarketPrices` (+ `populateRewards` and `populateIntrinsicApy` for full breakdown) | Return on equity breakdown. See below. |

### ROE (Return on Equity)

The `roe` property returns a `SubAccountRoe` object that breaks down the return on equity into four components. APY/ROE outputs are percentage points (`5` = `5%`). Reward campaign APR inputs remain decimal fractions on the raw campaign objects, but the computed breakdown converts them to percentage points.

```typescript
interface SubAccountRoe {
  lending: number;    // ROE contribution from base supply APYs
  borrowing: number;  // ROE contribution from base borrow APYs (typically negative)
  rewards: number;    // ROE contribution from reward APRs (supply + borrow incentives)
  intrinsicApy: number; // ROE contribution from intrinsic asset yield
  total: number;      // lending + borrowing + rewards + intrinsicApy
}
```

The formula aggregates across all positions in the sub-account:

```
For each position with supply:
  lendingYield  += supplyUsd * supplyAPY
  rewardYield   += supplyUsd * supplyRewardAPR   (LEND campaigns)
  intrinsicYield += supplyUsd * intrinsicApy

For each position with borrows:
  borrowYield   += borrowUsd * borrowAPY
  rewardYield   += borrowUsd * borrowRewardAPR   (BORROW campaigns)
  intrinsicYield -= borrowUsd * intrinsicApy

equity = totalSupplyUsd - totalBorrowUsd

lending   =  lendingYield / equity
borrowing = -borrowYield  / equity
rewards   =  rewardYield  / equity
intrinsicApy = intrinsicYield / equity
total     =  lending + borrowing + rewards + intrinsicApy
```

This is equivalent to the standard formula: `ROE = supplyAPY * multiplier - borrowAPY * (multiplier - 1)`.

Returns `undefined` when vault entities are not populated, no APY data is available, or equity <= 0.

#### APY sources by vault type

| Vault Type | Supply APY | Borrow APY | Reward APR |
|---|---|---|---|
| EVault | `interestRates.supplyAPY` | `interestRates.borrowAPY` | `rewards.campaigns` filtered by action |
| EulerEarn | `supplyApy` / `supplyApy1h` (adapter-provided 1h supply APY) | N/A | `rewards.campaigns` filtered by action |
| SecuritizeCollateralVault | N/A | N/A | `rewards.campaigns` filtered by action |

## AccountLiquidity Properties

| Property | Type | Prerequisites | Description |
|---|---|---|---|
| `collateralLiquidationPrices` | `Record<Address, bigint>` | Liquidity data | Per-collateral price multiplier (WAD) representing how much each collateral's price can drop before liquidation. |
| `borrowLiquidationPrice` | `bigint \| undefined` | Liquidity data | Borrow price multiplier (WAD). `> 1` = borrow price can increase by this factor before liquidation. |

## Account Properties

| Property | Type | Prerequisites | Description |
|---|---|---|---|
| `totalRewardsValueUsd` | `number \| undefined` | `populateUserRewards` | Total value of unclaimed reward tokens in USD. |

`totalSuppliedValueUsd`, `totalBorrowedValueUsd`, `netAssetValueUsd`, `netApy`, and `roe` are Portfolio-level metrics so filtering rules are applied consistently.

### Sub-account Selection

`Account` exposes helpers for selecting sub-accounts when preparing new positions:

```typescript
const freeSubAccounts = account.getFreeSubAccounts()
const nextSubAccount = account.getNextSubAccount()
const nextBorrowSubAccount = account.getNextSubAccount({ borrowVault })
```

`getFreeSubAccounts()` returns addresses with no active supplied or borrowed position. `getNextSubAccount()` returns the first address suitable for a new position. When `borrowVault` is provided, existing supplied and borrowed positions are treated as occupied, and any known enabled controllers on a candidate sub-account must match that borrow vault.

## Portfolio Properties

| Property | Type | Prerequisites | Description |
|---|---|---|---|
| `savings` | `PortfolioSavingsPosition[]` | `populateVaults` + `populateMarketPrices` | Supplied positions that are not actively backing debt in the same sub-account. |
| `borrows` | `PortfolioBorrowPosition[]` | `populateVaults` + `populateMarketPrices` | Debt positions plus their collateral positions and risk fields. |
| `totalSuppliedValueUsd` | `number \| undefined` | `populateMarketPrices` | Sum of supplied USD value across positions included in this portfolio. |
| `totalBorrowedValueUsd` | `number \| undefined` | `populateMarketPrices` | Sum of borrowed USD value across positions included in this portfolio. |
| `netAssetValueUsd` | `number \| undefined` | `populateMarketPrices` | `totalSuppliedValueUsd - totalBorrowedValueUsd`. |
| `netApy` | `number \| undefined` | `populateVaults` + `populateMarketPrices` | Net APY across positions included in this portfolio. |
| `roe` | `number \| undefined` | `populateVaults` + `populateMarketPrices` | Return on equity across positions included in this portfolio. |
| `apyBreakdown` | `YieldApyBreakdown \| undefined` | `populateVaults` + `populateMarketPrices` | Portfolio net APY contribution breakdown in percentage points. |
| `roeBreakdown` | `YieldApyBreakdown \| undefined` | `populateVaults` + `populateMarketPrices` | Portfolio ROE contribution breakdown in percentage points. |
| `totalRewardsValueUsd` | `number \| undefined` | `populateUserRewards` | Delegates to `account.totalRewardsValueUsd`. |

### Portfolio Categorization

`Portfolio` groups an account's raw sub-account positions into savings and borrows:

```typescript
const { result: portfolio } = await sdk.portfolioService.fetchPortfolio(chainId, owner)
const { savings, borrows } = portfolio

for (const saving of savings) {
  console.log(saving.subAccount, saving.position.vaultAddress, saving.assets)
}

for (const { borrow, collaterals } of borrows) {
  console.log(borrow.account, borrow.vaultAddress, borrow.borrowed)
  console.log(collaterals.map((collateral) => collateral.vaultAddress))
}
```

`savings` contains supplied positions that are not actively supporting debt in the same sub-account. `borrows` contains every position with debt, plus the supplied positions from that same sub-account that are active collateral for the borrow. If one `AccountPosition` has both debt and a supplied balance, the debt is represented in `borrows`; the supplied side is also included in `savings` unless that same vault is active collateral for a borrow in the same sub-account.

Collateral membership is taken from borrow liquidity data when available, with enabled collaterals used as a defensive fallback.

Portfolio can permanently filter positions with `positionFilter(position, { account })`. The same filter is applied to savings, borrows, totals, net APY, and ROE.

`Portfolio` also exposes `getFreeSubAccounts()` and `getNextSubAccount(...)`. These use the portfolio's filtered position view, while `Account` uses the full lower-level account tree.

## Standalone Yield Utilities

In addition to the computed getters, `accountComputations.ts` exports standalone functions for ad-hoc yield calculations. These take `number` parameters and do not depend on populated entities.

| Function | Signature | Description |
|---|---|---|
| `getRoe` | `(supplyUsd, supplyApy, borrowUsd, borrowApy, supplyRewardApy?, borrowRewardApy?) => number` | ROE for a single position. |
| `getNetApy` | `(supplyUsd, supplyApy, borrowUsd, borrowApy, supplyRewardApy?, borrowRewardApy?) => number` | Net APY relative to total supply value. |
| `getMaxRoe` | `(maxMultiplier, supplyApy, borrowApy) => number` | Maximum ROE at max leverage. |
| `getMaxMultiplier` | `(borrowLtv, safetyMargin?) => number` | Max leverage multiplier for a given borrow LTV. |
