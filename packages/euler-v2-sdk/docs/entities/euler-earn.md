# EulerEarn Entity

`EulerEarn` extends [ERC4626Vault](./erc4626-vault.md) with EulerEarn strategy,
queue, governance, fee, and APY metadata.

## Supporting Shapes

### `EulerEarnAllocationCap`

| Property | Type | Description |
| --- | --- | --- |
| `current` | `bigint` | Current allocation cap for a strategy. |
| `pending` | `bigint` | Pending allocation cap. |
| `pendingValidAt` | `number` | Timestamp when the pending cap becomes valid. |

### `EulerEarnStrategyInfo`

| Property | Type | Description |
| --- | --- | --- |
| `address` | `Address` | Strategy vault address. |
| `vaultType` | `VaultType` | Strategy vault type. |
| `allocatedAssets` | `bigint` | Assets allocated to the strategy. |
| `availableAssets` | `bigint` | Assets available in the strategy. |
| `allocationCap` | `EulerEarnAllocationCap` | Strategy allocation-cap state. |
| `removableAt` | `number` | Timestamp when the strategy becomes removable; `0` means not pending removal. |
| `vault` | `IVaultEntity | undefined` | Resolved strategy vault entity, populated by `populateStrategyVaults`. |

### `EulerEarnStrategyStatus`

`EulerEarnStrategyStatus` is `"active"`, `"inactive"`, or `"pendingRemoval"`.

### `EulerEarnGovernance`

| Property | Type | Description |
| --- | --- | --- |
| `owner` | `Address` | Owner address. |
| `creator` | `Address` | Creator address. |
| `curator` | `Address` | Curator address. |
| `guardian` | `Address` | Guardian address. |
| `feeReceiver` | `Address` | Fee receiver address. |
| `timelock` | `number` | Current timelock duration. |
| `pendingTimelock` | `number` | Pending timelock duration. |
| `pendingTimelockValidAt` | `number` | Timestamp when `pendingTimelock` becomes valid. |
| `pendingGuardian` | `Address` | Pending guardian address. |
| `pendingGuardianValidAt` | `number` | Timestamp when `pendingGuardian` becomes valid. |

### `EulerEarnPopulated`

`EulerEarnPopulated` includes all `ERC4626VaultPopulated` flags plus:

| Property | Type | Description |
| --- | --- | --- |
| `strategyVaults` | `boolean` | `true` when strategy vault entities have been populated or were provided resolved. |

## `IEulerEarn` Input Shape

`IEulerEarn` includes all [IERC4626Vault](./erc4626-vault.md#ierc4626vault-input-shape)
properties plus:

| Property | Type | Description |
| --- | --- | --- |
| `lostAssets` | `bigint` | Assets tracked as lost by the vault. |
| `availableAssets` | `bigint` | Assets available for withdrawal. |
| `performanceFee` | `number` | Performance fee. |
| `supplyApy1h` | `number | undefined` | One-hour supply APY in percentage points. |
| `governance` | `EulerEarnGovernance` | Governance and pending-governance state. |
| `supplyQueue` | `Address[]` | Ordered supply strategy queue. |
| `withdrawQueue` | `Address[]` | Ordered withdraw strategy queue. |
| `strategies` | `EulerEarnStrategyInfo[]` | Strategy states. |
| `timestamp` | `number` | Snapshot timestamp. |
| `populated` | `Partial<EulerEarnPopulated> | undefined` | Initial population flags. |

## `EulerEarn` Properties

`EulerEarn` has all [ERC4626Vault properties](./erc4626-vault.md#erc4626vault-properties)
plus the `IEulerEarn` properties above. Its `populated` property is
`EulerEarnPopulated`.

## Computed Getters

| Getter | Type | Description |
| --- | --- | --- |
| `isBorrowable` | `boolean` | Always `false`. |
| `availableLiquidity` | `bigint` | Returns `availableAssets`. |

## Methods

| Method | Returns | Description |
| --- | --- | --- |
| `isPendingRemoval(strategy)` | `boolean` | `true` when `getStrategyStatus(strategy)` is `"pendingRemoval"`. |
| `getStrategyStatus(strategy)` | `EulerEarnStrategyStatus` | Returns `"pendingRemoval"` when `removableAt > 0`, `"active"` when `allocationCap.current > 0n`, otherwise `"inactive"`. |
| `convertToAssets(shares)` | `bigint` | Converts shares to assets using EVault virtual deposit math. |
| `convertToShares(assets)` | `bigint` | Converts assets to shares using EVault virtual deposit math. |
| `populateStrategyVaults(vaultMetaService)` | `Promise<DataIssue[]>` | Resolves strategy vault entities and updates `populated.strategyVaults`. |
