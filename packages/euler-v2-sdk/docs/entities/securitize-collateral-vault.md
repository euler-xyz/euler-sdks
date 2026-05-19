# SecuritizeCollateralVault Entity

`SecuritizeCollateralVault` extends [ERC4626Vault](./erc4626-vault.md) for
Securitize collateral vault metadata.

## `ISecuritizeCollateralVault` Input Shape

`ISecuritizeCollateralVault` includes all
[IERC4626Vault](./erc4626-vault.md#ierc4626vault-input-shape) properties plus:

| Property | Type | Description |
| --- | --- | --- |
| `governor` | `Address` | Vault governor address. |
| `supplyCap` | `bigint` | Vault supply cap. |

## `SecuritizeCollateralVault` Properties

`SecuritizeCollateralVault` has all
[ERC4626Vault properties](./erc4626-vault.md#erc4626vault-properties) plus:

| Property | Type | Description |
| --- | --- | --- |
| `governor` | `Address` | Vault governor address. |
| `supplyCap` | `bigint` | Vault supply cap. |

## Computed Getters

| Getter | Type | Description |
| --- | --- | --- |
| `isBorrowable` | `boolean` | Always `false`. |

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `convertToAssets(shares)` | `bigint` | 1:1 share-to-asset conversion. |
| `convertToShares(assets)` | `bigint` | 1:1 asset-to-share conversion. |

