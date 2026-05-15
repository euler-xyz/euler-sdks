# Portfolio Entity

`Portfolio` is a high-level view over a populated `Account`. It groups account
positions into savings and borrow views and computes aggregate APY, ROE, value,
and liquidation fields. The constructor requires an account with `vaults` and
`marketPrices` populated.

## Supporting Shapes

### `PortfolioPositionFilterContext`

| Property | Type | Description |
| --- | --- | --- |
| `account` | `Account<TVaultEntity>` | Account used by the portfolio. |

### `PortfolioPositionFilter`

`PortfolioPositionFilter` is a function:

```typescript
(position, context) => boolean
```

It is applied to every `AccountPosition` considered by the portfolio.

### `PortfolioOptions`

| Property | Type | Description |
| --- | --- | --- |
| `positionFilter` | `PortfolioPositionFilter<TVaultEntity> | undefined` | Permanent predicate applied to positions considered by the portfolio. |

## `PortfolioSavingsPosition`

| Property | Type | Description |
| --- | --- | --- |
| `position` | `AccountPosition<TVaultEntity>` | Underlying supplied position. |
| `vault` | `TVaultEntity | undefined` | Resolved vault entity from the position. |
| `subAccount` | `Address` | Sub-account that owns the saving position. |
| `shares` | `bigint` | Supplied share balance. |
| `assets` | `bigint` | Supplied asset balance. |
| `suppliedValueUsd` | `number | undefined` | Supplied value in USD. |
| `apy` | `number | undefined` | Total supply APY in percentage points, including intrinsic APY and rewards. |
| `apyBreakdown` | `YieldApyBreakdown | undefined` | Supply APY contribution breakdown. |

## `PortfolioBorrowPosition`

| Property | Type | Description |
| --- | --- | --- |
| `borrow` | `AccountPosition<TVaultEntity>` | Underlying debt position. |
| `collaterals` | `AccountPosition<TVaultEntity>[]` | Collateral positions backing the debt. |
| `collateral` | `AccountPosition<TVaultEntity> | undefined` | Primary collateral position. |
| `borrowVault` | `TVaultEntity | undefined` | Resolved borrow vault entity. |
| `collateralVault` | `TVaultEntity | undefined` | Resolved primary collateral vault entity. |
| `collateralVaults` | `Address[]` | Collateral vault addresses backing the debt. |
| `subAccount` | `Address` | Sub-account that owns the borrow position. |
| `healthFactor` | `bigint | undefined` | Sub-account health factor in WAD. |
| `userLTV` | `bigint | undefined` | Alias of current sub-account LTV in WAD. |
| `currentLTV` | `bigint | undefined` | Current sub-account LTV in WAD. |
| `borrowed` | `bigint` | Borrowed asset amount. |
| `supplied` | `bigint` | Primary collateral supplied asset amount, or `0n`. |
| `price` | `number | undefined` | Borrow liquidation price in USD. |
| `primaryCollateralLiquidationPrice` | `number | undefined` | Liquidation price based on the primary collateral and liability values. |
| `borrowLiquidationPriceUsd` | `number | undefined` | Borrow liquidation price in USD. |
| `collateralLiquidationPricesUsd` | `Record<Address, number> | undefined` | Per-collateral liquidation prices in USD. |
| `liquidatable` | `boolean` | `true` when liability liquidation value exceeds collateral liquidation value and liquidity data is available. |
| `borrowLTV` | `number | undefined` | Borrow LTV for the primary collateral. |
| `liquidationLTV` | `number | undefined` | Liquidation LTV for the primary collateral. |
| `accountLiquidationLTV` | `number | undefined` | Weighted account liquidation LTV as a decimal ratio. |
| `liabilityValueBorrowing` | `bigint | undefined` | Liability value using borrowing risk price. |
| `liabilityValueLiquidation` | `bigint | undefined` | Liability value using liquidation risk price. |
| `liabilityValueUsd` | `number | undefined` | Liability value in USD. |
| `totalCollateralValueUsd` | `number | undefined` | Total collateral value in USD. |
| `collateralValueLiquidation` | `bigint | undefined` | Total collateral value using liquidation risk price. |
| `timeToLiquidation` | `DaysToLiquidation | undefined` | Time-to-liquidation estimate from liquidity data. |
| `multiplier` | `number | undefined` | Effective collateral multiplier, supplied value divided by equity value. |
| `netApy` | `number | undefined` | Net APY in percentage points relative to supplied collateral value. |
| `roe` | `number | undefined` | Return on equity in percentage points relative to supplied minus borrowed value. |
| `apyBreakdown` | `YieldApyBreakdown | undefined` | Net APY contribution breakdown. |
| `roeBreakdown` | `YieldApyBreakdown | undefined` | ROE contribution breakdown. |

## `IPortfolio` and `Portfolio` Properties

| Property | Type | Description |
| --- | --- | --- |
| `account` | `Account<TVaultEntity>` | Wrapped account entity. |
| `populated` | `AccountPopulated` | Population flags from the wrapped account. |

## Computed Getters

| Getter | Type | Description |
| --- | --- | --- |
| `positions` | `AccountPosition<TVaultEntity>[]` | Unique positions included in savings and borrows. |
| `savings` | `PortfolioSavingsPosition<TVaultEntity>[]` | Supplied positions not used as borrow collateral in this portfolio view. |
| `borrows` | `PortfolioBorrowPosition<TVaultEntity>[]` | Borrow positions with their backing collaterals and risk metrics. |
| `totalSuppliedValueUsd` | `number | undefined` | Sum of supplied value across included yield positions. |
| `totalBorrowedValueUsd` | `number | undefined` | Sum of borrowed value across included yield positions. |
| `netAssetValueUsd` | `number | undefined` | Supplied value minus borrowed value. |
| `netApy` | `number | undefined` | Net APY across included positions. |
| `roe` | `number | undefined` | Return on equity across included positions. |
| `apyBreakdown` | `YieldApyBreakdown | undefined` | Net APY contribution breakdown across included positions. |
| `roeBreakdown` | `YieldApyBreakdown | undefined` | ROE contribution breakdown across included positions. |
| `totalRewardsValueUsd` | `number | undefined` | Delegates to `account.totalRewardsValueUsd`. |

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `getFreeSubAccounts(options)` | `Address[]` | Returns sub-accounts without active supplied or borrowed positions in this portfolio view. |
| `getNextSubAccount(options)` | `Address | undefined` | Returns the first suitable sub-account for a new position in this portfolio view. |
| `getNewSubAccount(options)` | `Address | undefined` | Alias for `getNextSubAccount`. |

