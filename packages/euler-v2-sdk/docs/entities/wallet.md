# Wallet Entity

`Wallet` represents native/ERC-20 balances and direct/Permit2 allowance state
for one account on one chain.

## Supporting Shapes

### `AssetAllowances`

| Property | Type | Description |
| --- | --- | --- |
| `assetForVault` | `bigint` | Direct asset allowance granted to the vault/spender. |
| `assetForPermit2` | `bigint` | Asset allowance granted to Permit2. |
| `assetForVaultInPermit2` | `bigint` | Permit2 allowance from account to vault/spender. |
| `permit2ExpirationTime` | `number` | Permit2 allowance expiration timestamp. |
| `permit2Nonce` | `number` | Permit2 allowance nonce. |

### `WalletAsset`

| Property | Type | Description |
| --- | --- | --- |
| `account` | `Address` | Account address the balance belongs to. |
| `asset` | `Address` | Asset token address. |
| `balance` | `bigint` | Account balance for the asset. |
| `allowances` | `Record<Address, AssetAllowances>` | Allowances keyed by spender address. |

## `IWallet` Input Shape

| Property | Type | Description |
| --- | --- | --- |
| `chainId` | `number` | Chain ID for the wallet state. |
| `account` | `Address` | Wallet account address. |
| `assets` | `WalletAsset[]` | Asset balances and allowances. |

## `Wallet` Properties

| Property | Type | Description |
| --- | --- | --- |
| `chainId` | `number` | Chain ID for the wallet state. |
| `account` | `Address` | Wallet account address. |
| `assets` | `WalletAsset[]` | Asset balances and allowances. |

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `getAsset(asset)` | `WalletAsset | undefined` | Returns the wallet asset entry matching `asset`. |
| `getBalance(asset)` | `bigint` | Returns the asset balance, or `0n` when the asset is not present. |
| `getAllowances(asset, spender)` | `AssetAllowances | undefined` | Returns allowances for `spender` on `asset`. |

