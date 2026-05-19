# EVault Entity

`EVault` extends [ERC4626Vault](./erc4626-vault.md) with Euler V2 lending,
borrowing, oracle, collateral, cap, fee, hook, and interest-rate metadata.

## `EVaultHookedOperations`

Each property is a `boolean` indicating whether the hook target is invoked for
that operation.

| Property |
| --- |
| `deposit` |
| `mint` |
| `withdraw` |
| `redeem` |
| `transfer` |
| `skim` |
| `borrow` |
| `repay` |
| `repayWithShares` |
| `pullDebt` |
| `convertFees` |
| `liquidate` |
| `flashloan` |
| `touch` |
| `vaultStatusCheck` |

## Supporting Shapes

### `EVaultFees`

| Property | Type | Description |
| --- | --- | --- |
| `interestFee` | `number` | Vault interest fee. |
| `accumulatedFeesShares` | `bigint` | Accumulated fee shares. |
| `accumulatedFeesAssets` | `bigint` | Accumulated fee assets. |
| `governorFeeReceiver` | `Address` | Governor fee receiver address. |
| `protocolFeeReceiver` | `Address` | Protocol fee receiver address. |
| `protocolFeeShare` | `number` | Protocol fee share. |

### `EVaultHooks`

| Property | Type | Description |
| --- | --- | --- |
| `hookedOperations` | `EVaultHookedOperations` | Operation hook flags. |
| `hookTarget` | `Address` | Hook target contract address. |

### `EVaultCaps` and `EVaultCapsComputed`

| Property | Type | Description |
| --- | --- | --- |
| `supplyCap` | `bigint` | Maximum supplied assets. `maxUint256` means uncapped. |
| `borrowCap` | `bigint` | Maximum borrowed assets. `maxUint256` means uncapped. |
| `supplyCapUtilization` | `number` | Computed percentage of `totalAssets / supplyCap`; `0` when uncapped. |
| `borrowCapUtilization` | `number` | Computed percentage of `totalBorrowed / borrowCap`; `0` when uncapped. |

### `EVaultLiquidation`

| Property | Type | Description |
| --- | --- | --- |
| `maxLiquidationDiscount` | `number` | Maximum liquidation discount. |
| `liquidationCoolOffTime` | `number` | Cool-off time in seconds. |
| `socializeDebt` | `boolean` | Whether bad debt socialization is enabled. |

### `InterestRates`

| Property | Type | Description |
| --- | --- | --- |
| `borrowSPY` | `number` | Borrow SPY in percentage points, e.g. `5` means 5%. |
| `borrowAPY` | `number` | Borrow APY in percentage points. |
| `supplyAPY` | `number` | Supply APY in percentage points. |

### `InterestRateModel`

Every variant has `address`, `type`, `data`, and `params`.

| Variant | `data` | `params` |
| --- | --- | --- |
| `KINK` | `KinkIRMInfo | null` | `LinearKinkIRMParams | null` |
| `ADAPTIVE_CURVE` | `AdaptiveCurveIRMInfo | null` | `null` |
| `KINKY` | `KinkyIRMInfo | null` | `null` |
| `FIXED_CYCLICAL_BINARY` | `FixedCyclicalBinaryIRMInfo | null` | `null` |
| `UNKNOWN` | `null` | `null` |

### `IEVaultCollateral` and `EVaultCollateral`

| Property | Type | Description |
| --- | --- | --- |
| `address` | `Address` | Collateral vault address. |
| `borrowLTV` | `number` | Borrow LTV for this collateral. |
| `liquidationLTV` | `number` | Target liquidation LTV for this collateral. |
| `ramping` | `EVaultCollateralRamping | undefined` | Active or scheduled liquidation LTV ramp data. |
| `oraclePriceRaw` | `OraclePrice` | Raw oracle price data. Use EVault price helpers for risk pricing. |
| `vault` | `VaultEntity | undefined` | Resolved collateral vault entity, populated by `populateCollaterals`. |
| `oracleAdapters` | `OracleAdapterEntry[] | undefined` | Resolved oracle adapter path for this collateral. |
| `marketPriceUsd` | `PriceUsd | undefined` | USD price per collateral underlying, populated by `populateMarketPrices`. |
| `currentLiquidationLTV` | `number` | Computed current liquidation LTV, including active ramping. |
| `isLiquidationLTVRamping` | `boolean` | Computed `true` while liquidation LTV is actively ramping. |
| `rampTimeRemaining` | `bigint` | Computed remaining ramp time in seconds. |

### `EVaultCollateralRamping`

| Property | Type | Description |
| --- | --- | --- |
| `initialLiquidationLTV` | `number` | Liquidation LTV at the beginning of the ramp. |
| `targetTimestamp` | `number` | Timestamp when the ramp reaches the target LTV. |
| `rampDuration` | `bigint` | Ramp duration in seconds. |

### `RiskPrice`

| Property | Type | Description |
| --- | --- | --- |
| `priceLiquidation` | `bigint` | Liquidation-side risk price scaled to 18 decimals. |
| `priceBorrowing` | `bigint` | Borrowing-side risk price scaled to 18 decimals. |

### `EVaultPopulated`

`EVaultPopulated` includes all `ERC4626VaultPopulated` flags plus:

| Property | Type | Description |
| --- | --- | --- |
| `collaterals` | `boolean` | `true` when collateral vault entities and collateral oracle adapters have been populated. |

## `IEVault` Input Shape

`IEVault` includes all [IERC4626Vault](./erc4626-vault.md#ierc4626vault-input-shape)
properties plus:

| Property | Type | Description |
| --- | --- | --- |
| `unitOfAccount` | `Token | undefined` | Unit-of-account token metadata. |
| `totalCash` | `bigint` | Cash available in the vault. |
| `totalBorrowed` | `bigint` | Total borrowed assets. |
| `creator` | `Address` | Vault creator address. |
| `governorAdmin` | `Address` | Governor admin address. |
| `dToken` | `Address` | Debt token address. |
| `balanceTracker` | `Address` | Balance tracker address. |
| `fees` | `EVaultFees` | Fee configuration and accrued fees. |
| `hooks` | `EVaultHooks` | Hook configuration. |
| `caps` | `EVaultCaps` | Supply and borrow caps. |
| `liquidation` | `EVaultLiquidation` | Liquidation configuration. |
| `oracle` | `OracleInfo` | Oracle metadata, adapters, and resolved vault routes. |
| `interestRates` | `InterestRates` | Current supply and borrow rates. |
| `interestRateModel` | `InterestRateModel` | Interest-rate model metadata. |
| `collaterals` | `IEVaultCollateral[]` | Supported collateral configs. |
| `evcCompatibleAsset` | `boolean` | Whether the underlying asset is EVC-compatible. |
| `oraclePriceRaw` | `OraclePrice` | Raw asset oracle price data. Use EVault price helpers for risk pricing. |
| `timestamp` | `number` | Snapshot timestamp used for computed ramping fields. |
| `populated` | `Partial<EVaultPopulated> | undefined` | Initial population flags. |

## `EVault` Properties

`EVault` has all [ERC4626Vault properties](./erc4626-vault.md#erc4626vault-properties)
plus the `IEVault` properties above. Constructor normalization also adds:

| Property | Type | Description |
| --- | --- | --- |
| `caps` | `EVaultCapsComputed` | Caps with computed utilization getters. |
| `collaterals` | `EVaultCollateral[]` | Collaterals with computed ramping fields. |
| `debtPricingOracleAdapters` | `OracleAdapterEntry[]` | Sorted asset-to-unit-of-account oracle adapter path used for debt pricing. Empty when the vault is not borrowable or has no unit of account. |
| `populated` | `EVaultPopulated` | Base population flags plus `collaterals`. |

## Computed Getters

| Getter | Type | Description |
| --- | --- | --- |
| `isBorrowable` | `boolean` | `true` when at least one collateral has active borrow or liquidation LTV, including active ramp-down state. |
| `availableLiquidity` | `bigint` | Returns `totalCash`. |
| `utilization` | `number` | Percentage of `totalBorrowed / totalAssets`. |
| `availableToBorrow` | `bigint` | Minimum of `totalCash` and remaining borrow cap; returns `0n` when cap is reached. |
| `assetRiskPrice` | `RiskPrice | undefined` | Asset/unit-of-account risk price from the vault oracle. |

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `convertToAssets(shares)` | `bigint` | Converts shares to assets using EVault virtual deposit math. |
| `convertToShares(assets)` | `bigint` | Converts assets to shares using EVault virtual deposit math. |
| `getCollateralRiskPrice(collateralVault)` | `RiskPrice | undefined` | Collateral/unit-of-account risk price from the vault oracle. |
| `fetchUnitOfAccountMarketPriceUsd(priceService)` | `Promise<number | undefined>` | Fetches the unit-of-account USD rate. |
| `fetchCollateralMarketPriceUsd(collateralVault, priceService)` | `Promise<number | undefined>` | Fetches collateral underlying USD price. |
| `fetchCollateralMarketValueUsd(amount, collateralVault, priceService)` | `Promise<number | undefined>` | Converts a collateral amount to USD using the price service. |
| `populateCollaterals(vaultMetaService)` | `Promise<DataIssue[]>` | Resolves collateral vault entities, collateral oracle adapters, and `populated.collaterals`. |
| `populateMarketPrices(priceService)` | `Promise<DataIssue[]>` | Populates asset and resolved collateral USD prices and `populated.marketPrices`. |

## Other Exports

| Export | Type | Description |
| --- | --- | --- |
| `hasActiveBorrowableLtv(collaterals, vaultTimestamp)` | `boolean` | Returns `true` when any collateral has active LTV or active ramp-down borrowability at `vaultTimestamp`. |
