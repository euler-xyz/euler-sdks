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
| `FIXED_CYCLICAL_BINARY_MONTHLY` | `FixedCyclicalBinaryMonthlyIRMInfo | null` | `null` |
| `UNKNOWN` | `null` | `null` |

For Adaptive Curve IRMs, `adaptiveRateAtTargetToBorrowSPY(wadPerSecond)` scales a WAD-per-second `rateAtTarget` into a borrow SPY (multiplying by `ADAPTIVE_RATE_AT_TARGET_TO_BORROW_SPY_SCALE`, i.e. `1e9`). It returns `bigint | null` (`null` for negative input).

### Oracle Routing

`oracle` contains the root oracle identity (`oracle`, `name`). Selected pricing
routes are stored on `debtPricingOracleRoute` and `collaterals[].oracleRoute`.
A route is for one `base -> quote` pair and its `steps` array is ordered in the
same order a UI should display or quote it.

| Type | Description |
| --- | --- |
| `OracleRoute` | Effective route for a `base -> quote` pair. `steps` is the canonical display and quote surface. Use `getOracleRouteAdapters(route)` or `getOracleRouteResolvedVaults(route)` for derived projections. |
| `OracleRouteAdapterStep` | Leaf oracle adapter step. Quote it with `getQuote(amountIn, base, quote)` on `oracle`. |
| `OracleRouteVaultStep` | ERC4626-style vault/share resolution step. Quote it with `convertToAssets(amountIn)` on `vault`. |
| `OracleRouteSource` | `configured` for an explicit EulerRouter route, `fallback` when the router fallback oracle handles the pair, and `direct` when the root oracle info handles the pair directly. |

### `IEVaultCollateral` and `EVaultCollateral`

| Property | Type | Description |
| --- | --- | --- |
| `address` | `Address` | Collateral vault address. |
| `borrowLTV` | `number` | Borrow LTV for this collateral. |
| `liquidationLTV` | `number` | Target liquidation LTV for this collateral. |
| `ramping` | `EVaultCollateralRamping | undefined` | Active or scheduled liquidation LTV ramp data. |
| `oraclePriceRaw` | `OraclePrice` | Raw oracle price data. Use EVault price helpers for risk pricing. |
| `vault` | `VaultEntity | undefined` | Resolved collateral vault entity, populated by `populateCollaterals`. |
| `oracleRoute` | `OracleRoute | undefined` | Effective ordered collateral-to-unit-of-account route. Includes adapter steps and ERC4626 vault resolution steps. |
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
| `vaultFamily` | `EVaultFamily | null | undefined` | Vault family. Derived from the vault configuration when absent; pass `null` to report a family the source could not read. See [Vault Family](#vault-family). |
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
| `oracle` | `OracleInfo` | Oracle metadata, decoded routes, leaf adapters, and resolved vault projections. |
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
| `vaultFamily` | `EVaultFamily | null` | `"escrow"`, `"evk"`, or `null` when the source could not read the configuration it is derived from. See [Vault Family](#vault-family). |
| `caps` | `EVaultCapsComputed` | Caps with computed utilization getters. |
| `collaterals` | `EVaultCollateral[]` | Collaterals with computed ramping fields. |
| `debtPricingOracleRoute` | `OracleRoute | undefined` | Effective ordered asset-to-unit-of-account route when the vault has a unit of account. |
| `populated` | `EVaultPopulated` | Base population flags plus `collaterals`. |

## Vault Family

`vaultFamily` separates escrowed collateral vaults from regular credit vaults.
It is spelled the way Euler V3 data services publish `vaultType`, so a family
read here and one read from V3 compare directly. It answers a different
question from `type`, which names the vault service that handles the vault:
`"evk"` and `"escrow"` vaults are both `VaultType.EVault`.

| Family | Meaning |
| --- | --- |
| `"escrow"` | Ungoverned and prices nothing: no governor admin, no oracle, no unit of account. |
| `"evk"` | Every other EVK vault. |
| `null` | The source did not provide `governorAdmin`, `oracle`, or `unitOfAccount`, so the vault could not be classified. |

Setting any of the three takes a governor, so an ungoverned vault's answer
cannot change under governance, and the family costs no extra call.

Those three are not every escrow property the perspective checks. Its remaining
configuration checks (no caps, hooks, config flags, liquidation parameters,
collaterals) are left out deliberately: V3 omits those blocks from a row when
they are empty and they default to values a lens-sourced escrow vault does not
have, so including them would classify the same vault differently depending on
which adapter fetched it. The perspective also checks registry state no vault
entity carries (factory proxy, upgradeability, asset nesting, one escrow per
asset).

A vault whose governor renounced after configuring caps or hooks is therefore
`"escrow"` here and rejected by the perspective. When the registry's own answer
is what you need, ask it directly:

```typescript
const escrowAddresses = await sdk.eVaultService.fetchVerifiedVaultAddresses(1, [
  StandardEVaultPerspectives.ESCROW,
])
```

The third state is deliberate. A field the source never provided falls back to
the zero address elsewhere in the entity, and reading that fallback as "no
governor, no oracle" would turn a failed read into a confident `"escrow"`. The
family is only decided from values a source actually provided; otherwise it is
`null`, and `errors` carries a `SOURCE_UNAVAILABLE` issue at `$.vaultFamily`
naming the fields that were missing. A vault that could not be fetched at all
has no entity: `fetchVault` returns `undefined` with a diagnostic.

V3 publishes all three fields on every vault — an escrow vault carries the zero
address rather than a missing field — so a `null` family means the row was
incomplete, not that the vault is unusual. `EulerEarn` and
`SecuritizeCollateralVault` families are structural and never `null`.

Passing `vaultFamily: undefined` asks the entity to derive one, so rebuilding an
entity whose family is `null` must pass the `null` through — spreading an entity
(`new EVault({ ...vault })`) does exactly that.

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
| `populateCollaterals(vaultMetaService)` | `Promise<DataIssue[]>` | Resolves collateral vault entities, collateral oracle routes, collateral oracle adapter projections, and `populated.collaterals`. |
| `populateMarketPrices(priceService)` | `Promise<DataIssue[]>` | Populates asset and resolved collateral USD prices and `populated.marketPrices`. |

## Other Exports

| Export | Type | Description |
| --- | --- | --- |
| `hasActiveBorrowableLtv(collaterals, vaultTimestamp)` | `boolean` | Returns `true` when any collateral has active LTV or active ramp-down borrowability at `vaultTimestamp`. |
| `deriveEVaultFamily(signals)` | `EVaultFamily` | Classifies a vault from its `governorAdmin`, `oracle`, and `unitOfAccount`. Exported from `src/utils/vaultFamily.ts` alongside `VAULT_FAMILIES`, `VaultFamily`, and `EVaultFamily`. |
