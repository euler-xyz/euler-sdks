# Account Entity

`Account` represents an owner, its Euler sub-accounts, positions, liquidity,
market-price enrichment, and user reward enrichment.

## Supporting Types

### `AddressPrefix`

`AddressPrefix` is `` `0x${string}` `` and represents the 19-byte hex prefix
used for sub-account address derivation.

### `IHasVaultAddress`

| Property | Type | Description |
| --- | --- | --- |
| `address` | `Address` | Vault-like entity address. Used as the generic constraint for account vault references. |

### `IVaultEntity`

`IVaultEntity` is the SDK default vault entity union exported by the vault meta
service.

### `AccountPopulated`

| Property | Type | Description |
| --- | --- | --- |
| `vaults` | `boolean` | `true` when positions and liquidity collaterals have resolved vault entities. |
| `marketPrices` | `boolean` | `true` when position and liquidity USD values have been populated. |
| `userRewards` | `boolean` | `true` when per-user rewards have been populated. |

### `AssetValue`

| Property | Type | Description |
| --- | --- | --- |
| `liquidation` | `bigint` | Oracle/risk value used for liquidation calculations. |
| `borrowing` | `bigint` | Oracle/risk value used for borrow calculations. |
| `oracleMid` | `bigint` | Mid oracle value. |

### `DaysToLiquidation`

`DaysToLiquidation` is `"Infinity"`, `"MoreThanAYear"`, or a `number`.

## Liquidity Shapes

### `AccountLiquidityCollateral`

| Property | Type | Description |
| --- | --- | --- |
| `address` | `Address` | Collateral vault address. |
| `vault` | `TVaultEntity | undefined` | Resolved collateral vault entity, populated by `populateVaults`. |
| `value` | `AssetValue` | Collateral value in liquidation, borrowing, and oracle-mid terms. |
| `marketPriceUsd` | `PriceUsd | undefined` | USD price per collateral underlying, populated by `populateMarketPrices`. |
| `valueUsd` | `number | undefined` | Collateral value in USD, computed from collateral deposits and `marketPriceUsd`. |

### `IAccountLiquidity` and `AccountLiquidity`

| Property | Type | Description |
| --- | --- | --- |
| `vaultAddress` | `Address` | Borrow/liability vault address. |
| `vault` | `TVaultEntity | undefined` | Resolved borrow vault entity, populated by `populateVaults`. |
| `unitOfAccount` | `Address` | Unit-of-account token address for liquidity values. |
| `daysToLiquidation` | `DaysToLiquidation` | Time-to-liquidation estimate. |
| `liabilityValue` | `AssetValue` | Liability value in liquidation, borrowing, and oracle-mid terms. |
| `totalCollateralValue` | `AssetValue` | Total collateral value in liquidation, borrowing, and oracle-mid terms. |
| `collaterals` | `AccountLiquidityCollateral<TVaultEntity>[]` | Collateral values backing the liability. |
| `liabilityValueUsd` | `number | undefined` | Liability value in USD, populated by `populateMarketPrices`. |
| `totalCollateralValueUsd` | `number | undefined` | Total collateral value in USD, populated by `populateMarketPrices`. |
| `collateralLiquidationPrices` | `Record<Address, bigint>` on `AccountLiquidity`; optional on `IAccountLiquidity` | Computed WAD multipliers for per-collateral liquidation prices. |
| `borrowLiquidationPrice` | `bigint | undefined` | Computed WAD multiplier for borrow liquidation price. Values above `1e18` indicate margin above the current price. |

## Position Shapes

### `IAccountPosition` and `AccountPosition`

| Property | Type | Description |
| --- | --- | --- |
| `account` | `Address` | Sub-account address that owns the position. |
| `vaultAddress` | `Address` | Position vault address. |
| `vault` | `TVaultEntity | undefined` | Resolved vault entity, populated by `populateVaults`. |
| `asset` | `Address` | Underlying asset address. |
| `shares` | `bigint` | Supplied share balance. |
| `assets` | `bigint` | Supplied asset balance. |
| `borrowed` | `bigint` | Borrowed asset balance. |
| `isController` | `boolean` | Whether the vault is enabled as a controller on the sub-account. |
| `isCollateral` | `boolean` | Whether the vault is enabled as collateral on the sub-account. |
| `balanceForwarderEnabled` | `boolean` | Whether balance forwarding is enabled for the position. |
| `liquidity` | `IAccountLiquidity<TVaultEntity> | undefined` | Liquidity state for borrow positions. Raw liquidity objects are wrapped into `AccountLiquidity`. |
| `marketPriceUsd` | `PriceUsd | undefined` | USD price per underlying asset, populated by `populateMarketPrices`. |
| `suppliedValueUsd` | `number | undefined` | Supplied value in USD, computed from `assets` and `marketPriceUsd`. |
| `borrowedValueUsd` | `number | undefined` | Borrowed value in USD, computed from `borrowed` and `marketPriceUsd`. |
| `borrowLiquidationPriceUsd` | `number | undefined` | Computed borrow liquidation price in USD. |
| `collateralLiquidationPricesUsd` | `Record<Address, number> | undefined` | Computed per-collateral liquidation prices in USD. |

## Sub-Account Shapes

### `ISubAccount` and `SubAccount`

| Property | Type | Description |
| --- | --- | --- |
| `timestamp` | `number` | Snapshot timestamp for the sub-account state. |
| `account` | `Address` | Sub-account address. |
| `owner` | `Address` | Owner address. |
| `lastAccountStatusCheckTimestamp` | `number` | Last account-status-check timestamp. |
| `enabledControllers` | `Address[]` | Enabled controller vault addresses. |
| `enabledCollaterals` | `Address[]` | Enabled collateral vault addresses. |
| `positions` | `AccountPosition<TVaultEntity>[]` | Position list. Raw positions are wrapped into `AccountPosition`. |
| `healthFactor` | `bigint | undefined` | Computed WAD health factor. Values above `1e18` are healthy. |
| `currentLTV` | `bigint | undefined` | Computed current LTV in WAD. |
| `liquidationLTV` | `bigint | undefined` | Computed weighted-average liquidation LTV limit in WAD. |
| `multiplier` | `number | undefined` | Computed leverage multiplier. Requires USD data. |
| `totalCollateralValueUsd` | `number | undefined` | Computed total collateral value in USD. Requires USD data. |
| `liabilityValueUsd` | `number | undefined` | Computed liability value in USD. Requires USD data. |
| `netValueUsd` | `number | undefined` | Computed supplied value minus borrowed value in USD. |
| `roe` | `SubAccountRoe | undefined` | Computed return-on-equity breakdown. Requires populated vaults and market prices. |

### `SubAccountsMap`

`SubAccountsMap<TVaultEntity>` is
`Partial<Record<Address, SubAccount<TVaultEntity>>>`, keyed by sub-account
address.

## `IAccount` Input Shape

| Property | Type | Description |
| --- | --- | --- |
| `chainId` | `number` | Chain ID for account state. |
| `owner` | `Address` | Owner EOA or account owner address. |
| `subAccounts` | `Partial<Record<Address, ISubAccount<TVaultEntity>>>` | Sub-account state keyed by sub-account address. |
| `isLockdownMode` | `boolean | undefined` | Account lockdown mode flag. Constructor defaults to `false`. |
| `isPermitDisabledMode` | `boolean | undefined` | Account permit-disabled mode flag. Constructor defaults to `false`. |
| `populated` | `Partial<AccountPopulated> | undefined` | Initial population flags. Missing flags default to `false`. |

### `GetNextSubAccountOptions`

`GetNextSubAccountOptions` includes `GetFreeSubAccountsOptions` plus:

| Property | Type | Description |
| --- | --- | --- |
| `borrowVault` | `Address | undefined` | Borrow vault being opened. When present, supplied and borrowed sub-accounts are occupied and existing controllers must be compatible. |

## `Account` Properties

| Property | Type | Description |
| --- | --- | --- |
| `chainId` | `number` | Chain ID for account state. |
| `owner` | `Address` | Owner address. |
| `isLockdownMode` | `boolean` | Account lockdown mode flag. |
| `isPermitDisabledMode` | `boolean` | Account permit-disabled mode flag. |
| `subAccounts` | `SubAccountsMap<TVaultEntity>` | Wrapped sub-account map keyed by address. |
| `userRewards` | `UserReward[] | undefined` | Per-user unclaimed rewards from rewards providers, populated by `populateUserRewards`. |
| `populated` | `AccountPopulated` | Population flags. Constructor fills missing flags with `false`. |

## Computed Getters

| Getter | Type | Description |
| --- | --- | --- |
| `totalRewardsValueUsd` | `number | undefined` | Total unclaimed reward value in USD. Returns `undefined` when rewards are not populated or empty. |

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `getSubAccount(account)` | `SubAccount<TVaultEntity> | undefined` | Returns a sub-account by address. |
| `getSubAccountById(id)` | `SubAccount<TVaultEntity> | undefined` | Derives and returns a sub-account by numeric sub-account ID. |
| `getFreeSubAccounts(options)` | `Address[]` | Returns sub-account addresses without active supplied or borrowed positions. |
| `getNextSubAccount(options)` | `Address | undefined` | Returns the first suitable sub-account for a new position, optionally borrow-vault compatible. |
| `getNewSubAccount(options)` | `Address | undefined` | Alias for `getNextSubAccount`. |
| `getPosition(account, vault)` | `AccountPosition<TVaultEntity> | undefined` | Returns a position for a sub-account and vault. |
| `isCollateralEnabled(subAccountAddress, vault)` | `boolean` | Checks whether a vault is enabled as collateral for the sub-account. |
| `isControllerEnabled(subAccountAddress, vault)` | `boolean` | Checks whether a vault is enabled as controller for the sub-account. |
| `getCurrentController(subAccountAddress)` | `Address | undefined` | Returns the first enabled controller, or `undefined` when none is enabled. |
| `populateVaults(vaultMetaService, options)` | `Promise<DataIssue[]>` | Resolves vault entities onto positions and liquidity collaterals; mutates `populated.vaults`. |
| `mapVaultsToPositions(vaults)` | `Account<TResolved>` | Maps already-fetched vault entities onto positions and liquidity collaterals. |
| `populateMarketPrices(priceService)` | `Promise<DataIssue[]>` | Requires `populated.vaults`; populates nested vault prices and position/liquidity USD values. |
| `populateUserRewards(rewardsService)` | `Promise<DataIssue[]>` | Fetches user rewards and mutates `userRewards` and `populated.userRewards`. |
| `updateSubAccounts(...subAccounts)` | `void` | Replaces the sub-account map with the provided sub-accounts keyed by address. |

## Other Exports

| Export | Type | Description |
| --- | --- | --- |
| `AddressOrAccount` | `Address | Account<IHasVaultAddress>` | Helper input type for APIs that accept an address or account entity. |
