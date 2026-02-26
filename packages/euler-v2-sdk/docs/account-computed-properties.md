# Account Computed Properties

`Account`, `SubAccount`, and `AccountLiquidity` expose computed getter properties that derive risk metrics, USD valuations, and yield data from underlying position data. All getters return `undefined` when their prerequisite data has not been populated.

## Population Prerequisites

Computed properties depend on data populated by calling `populateVaults`, `populateMarketPrices`, and `populateUserRewards`. The table below shows which population steps each property requires.

| Population Step | Method | Service | What It Provides |
|---|---|---|---|
| Vaults | `account.populateVaults(vaultMetaService)` | VaultMetaService | Vault entities on positions (APY, asset metadata, IRM) |
| Market Prices | `account.populateMarketPrices(priceService)` | PriceService | `suppliedValueUsd`, `borrowedValueUsd` on positions; `liabilityValueUsd`, `totalCollateralValueUsd` on liquidity |
| Rewards (on vaults) | via `vaultFetchOptions.populateRewards` | RewardsService | `vault.rewards.campaigns` with per-campaign APR |
| User Rewards | `account.populateUserRewards(rewardsService)` | RewardsService | `account.userRewards` (unclaimed reward tokens) |

Typical setup to enable all computed properties:

```typescript
const account = await accountService.fetchAccount(chainId, owner, {
  populateVaults: true,
  populateMarketPrices: true,
  populateUserRewards: true,
  vaultFetchOptions: {
    populateMarketPrices: true,
    populateRewards: true,
  },
});
```

## SubAccount Properties

| Property | Type | Prerequisites | Description |
|---|---|---|---|
| `healthFactor` | `bigint \| undefined` | Liquidity data (included by default) | `totalCollateralValue.liquidation / liabilityValue.liquidation` (WAD). `> 1e18` = healthy, `< 1e18` = liquidatable. |
| `currentLTV` | `bigint \| undefined` | Liquidity data | `liabilityValue / totalCollateralValue` (WAD). Current loan-to-value ratio. |
| `liquidationLTV` | `bigint \| undefined` | Liquidity data | `totalCollateralValue.liquidation / totalCollateralValue.oracleMid` (WAD). Weighted-average liquidation threshold. |
| `multiplier` | `bigint \| undefined` | `populateMarketPrices` | `totalCollateralValueUsd / equity` (WAD, 1e18 = 1x). Leverage multiplier. |
| `totalCollateralValueUsd` | `bigint \| undefined` | `populateMarketPrices` | Total collateral value in USD from sub-account liquidity (18 dec). |
| `liabilityValueUsd` | `bigint \| undefined` | `populateMarketPrices` | Liability value in USD from sub-account liquidity (18 dec). |
| `netValueUsd` | `bigint \| undefined` | `populateMarketPrices` | `sum(suppliedValueUsd) - sum(borrowedValueUsd)` (18 dec). Net asset value in USD. |
| `roe` | `SubAccountRoe \| undefined` | `populateVaults` + `populateMarketPrices` (+ `populateRewards` and `populateIntrinsicApy` for full breakdown) | Return on equity breakdown. See below. |

### ROE (Return on Equity)

The `roe` property returns a `SubAccountRoe` object that breaks down the return on equity into four components. All values are decimal fractions (0.05 = 5%).

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
| EulerEarn | `supplyApy` (weighted from strategies, net of performance fee) | N/A | `rewards.campaigns` filtered by action |
| SecuritizeCollateralVault | N/A | N/A | `rewards.campaigns` filtered by action |

## AccountLiquidity Properties

| Property | Type | Prerequisites | Description |
|---|---|---|---|
| `collateralLiquidationPrices` | `Record<Address, bigint>` | Liquidity data | Per-collateral price multiplier (WAD) representing how much each collateral's price can drop before liquidation. |
| `borrowLiquidationPrice` | `bigint \| undefined` | Liquidity data | Borrow price multiplier (WAD). `> 1` = borrow price can increase by this factor before liquidation. |

## Account Properties

| Property | Type | Prerequisites | Description |
|---|---|---|---|
| `totalSuppliedValueUsd` | `bigint \| undefined` | `populateMarketPrices` | Sum of `suppliedValueUsd` across all positions in all sub-accounts (18 dec). |
| `totalBorrowedValueUsd` | `bigint \| undefined` | `populateMarketPrices` | Sum of `borrowedValueUsd` across all positions in all sub-accounts (18 dec). |
| `netAssetValueUsd` | `bigint \| undefined` | `populateMarketPrices` | `totalSuppliedValueUsd - totalBorrowedValueUsd` (18 dec). |
| `totalRewardsValueUsd` | `bigint \| undefined` | `populateUserRewards` | Total value of unclaimed reward tokens in USD (18 dec). |

## Standalone Yield Utilities

In addition to the computed getters, `accountComputations.ts` exports standalone functions for ad-hoc yield calculations. These take `number` parameters and do not depend on populated entities.

| Function | Signature | Description |
|---|---|---|
| `getRoe` | `(supplyUsd, supplyApy, borrowUsd, borrowApy, supplyRewardApy?, borrowRewardApy?) => number` | ROE for a single position. |
| `getNetApy` | `(supplyUsd, supplyApy, borrowUsd, borrowApy, supplyRewardApy?, borrowRewardApy?) => number` | Net APY relative to total supply value. |
| `getMaxRoe` | `(maxMultiplier, supplyApy, borrowApy) => number` | Maximum ROE at max leverage. |
| `getMaxMultiplier` | `(borrowLtv, safetyMargin?) => number` | Max leverage multiplier for a given borrow LTV. |
