# ERC4626Vault Entity

`ERC4626Vault` is the base vault entity for ERC-4626-compatible vaults. EVault,
EulerEarn, and Securitize collateral vault entities extend it.

## Supporting Types

### `VIRTUAL_DEPOSIT_AMOUNT`

`VIRTUAL_DEPOSIT_AMOUNT` is `1_000_000n`. EVault-like conversion methods use it
to match protocol virtual-deposit math.

### `Token`

| Property | Type | Description |
| --- | --- | --- |
| `address` | `Address` | Token contract address. |
| `name` | `string` | Token display name. |
| `symbol` | `string` | Token symbol. |
| `decimals` | `number` | Token decimals. |
| `logoURI` | `string | undefined` | Optional token logo URL. |

### `PriceUsd`

`PriceUsd` is a `number` representing USD price per whole token.

### `ERC4626VaultPopulated`

| Property | Type | Description |
| --- | --- | --- |
| `marketPrices` | `boolean` | `true` when `marketPriceUsd` has been populated. |
| `rewards` | `boolean` | `true` when `rewards` has been populated. |
| `intrinsicApy` | `boolean` | `true` when `intrinsicApy` has been populated. |
| `labels` | `boolean` | `true` when `eulerLabel` has been populated. |

### `IERC4626VaultConversion`

| Method | Returns | Description |
| --- | --- | --- |
| `convertToAssets(shares)` | `bigint` | Converts share amount to asset amount. |
| `convertToShares(assets)` | `bigint` | Converts asset amount to share amount. |

## `IERC4626Vault` Input Shape

| Property | Type | Description |
| --- | --- | --- |
| `type` | `string` | Vault type identifier. |
| `chainId` | `number` | Chain ID where the vault lives. |
| `address` | `Address` | Vault contract address. |
| `shares` | `Token` | ERC-4626 share token metadata. |
| `asset` | `Token` | Underlying asset token metadata. |
| `totalShares` | `bigint` | Total share supply. |
| `totalAssets` | `bigint` | Total underlying assets. |
| `isBorrowable` | `boolean` | Read-only borrowability signal on entity instances. |
| `populated` | `Partial<ERC4626VaultPopulated> | undefined` | Initial population flags. Missing flags default to `false`. |

## `ERC4626Vault` Properties

| Property | Type | Description |
| --- | --- | --- |
| `type` | `string` | Vault type identifier. |
| `chainId` | `number` | Chain ID where the vault lives. |
| `address` | `Address` | Vault contract address. |
| `shares` | `Token` | ERC-4626 share token metadata. |
| `asset` | `Token` | Underlying asset token metadata. |
| `totalShares` | `bigint` | Total share supply. |
| `totalAssets` | `bigint` | Total underlying assets. |
| `marketPriceUsd` | `PriceUsd | undefined` | USD price per whole underlying asset, populated by `populateMarketPrices`. |
| `rewards` | `VaultRewardInfo | undefined` | Vault reward campaign data, populated by `populateRewards`. |
| `intrinsicApy` | `IntrinsicApyInfo | undefined` | Intrinsic APY data populated by SDK services that enrich vault APY. |
| `eulerLabel` | `EulerLabel | undefined` | Resolved Euler label metadata. |
| `populated` | `ERC4626VaultPopulated` | Population flags. Constructor fills missing flags with `false`. |

## Computed Getters

| Getter | Type | Description |
| --- | --- | --- |
| `isBorrowable` | `boolean` | Always `false` on the base entity. Borrowable vault types override it. |
| `availableLiquidity` | `bigint` | Returns `totalAssets` on the base entity. |

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `convertToAssets(shares)` | `bigint` | Base 1:1 share-to-asset conversion. |
| `convertToShares(assets)` | `bigint` | Base 1:1 asset-to-share conversion. |
| `fetchAssetMarketValueUsd(amount, priceService)` | `Promise<number | undefined>` | Fetches the asset USD price and converts `amount` to USD. |
| `populateMarketPrices(priceService)` | `Promise<DataIssue[]>` | Mutates `marketPriceUsd` and `populated.marketPrices`; returns diagnostics. |
| `populateRewards(rewardsService)` | `Promise<DataIssue[]>` | Mutates `rewards` and `populated.rewards`; returns diagnostics. |
