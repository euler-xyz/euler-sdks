# Euler Data V3 Docs Schema and Adapter Gap Analysis

Source: rendered Scalar docs at `https://v3staging.eul.dev/v3/docs`
Collected: 2026-03-10
Method: browsed rendered docs sections and toggled per-route schema views in the docs UI; did not use the single OpenAPI JSON as the primary source.

## Global contract

- Base path: `/v3`
- Numeric on-chain quantities are usually returned as decimal strings.
- USD prices are numbers.
- Timestamps are mostly ISO-8601 strings, with some historical endpoints also exposing unix-second fields.
- Most list responses use `{ data, meta }`.
- `meta` is usually `{ total, offset, limit, timestamp, chainId }`.
- Most non-200 responses use the standard envelope:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "requestId": "string",
    "details": {}
  }
}
```

## Route inventory

Outputs below are the success payloads documented in the rendered docs. Error outputs use the standard error envelope unless noted otherwise.

### Protocol

- `GET /v3`
  - Inputs: none
  - Output: service metadata `{ name, version, docs, openapi, health }` plus `meta`
- `GET /v3/openapi.json`
  - Inputs: none
  - Output: raw OpenAPI document body
- `GET /v3/docs`
  - Inputs: none
  - Output: docs UI HTML
- `GET /v3/protocol/stats`
  - Inputs: `chainId`
  - Output: `{ totalSuppliedUsd, totalBorrowedUsd, earnTotalAssetsUsd, utilization, vaultCount, chainCount }` plus `meta`

### Health

- `GET /v3/health`
  - Inputs: none
  - Output: `{ status, version, uptime, timestamp }` plus `meta`
- `GET /v3/health/detailed`
  - Inputs: none
  - Output: health payload plus dependency checks for `database`, `redis`, `indexer`, `ponder`
- `GET /v3/health/live`
  - Inputs: none
  - Output: `{ status: "ok" }` plus `meta`
- `GET /v3/health/ready`
  - Inputs: none
  - Output: `200` => `{ status: "ready" }` plus `meta`; `503` => `{ status: "not_ready", reasons, checks }` plus `meta`
- `GET /v3/metrics`
  - Inputs: none
  - Output: Prometheus text payload

### Auth

- `POST /v3/admin/api-keys`
  - Inputs: body `name`, `expiresInDays`, `keyType`, `ownerEmail`, `rateLimit`, `scopeMode`, `vaultAllowlist`
  - Output: created API key record
- `GET /v3/admin/api-keys`
  - Inputs: none
  - Output: API key list
- `GET /v3/admin/api-keys/{id}`
  - Inputs: path `id`
  - Output: single API key
- `PATCH /v3/admin/api-keys/{id}`
  - Inputs: path `id`; body `isActive`, `keyType`, `name`, `rateLimit`, `scopeMode`, `vaultAllowlist`
  - Output: updated API key
- `DELETE /v3/admin/api-keys/{id}`
  - Inputs: path `id`
  - Output: revoke result
- `GET /v3/admin/api-keys/{id}/usage`
  - Inputs: path `id`; query `days`
  - Output: usage stats for the key

### Curator

- `GET /v3/curator/vaults`
  - Inputs: `chainId`, `offset`, `limit`
  - Output: curator-labeled vault list
- `PUT /v3/curator/vaults/{chainId}/{address}/labels`
  - Inputs: path `chainId`, `address`; body `displayName`, `description`, `productCategory`, `riskTier`, `strategyDescription`
  - Output: saved label payload

### Usage

- `GET /v3/usage/stats`
  - Inputs: none
  - Output: authenticated key usage stats

### Chains

- `GET /v3/chains`
  - Inputs: none
  - Output: supported chains list
- `GET /v3/chains/{chainId}/stats`
  - Inputs: path `chainId`
  - Output: chain-level stats
- `GET /v3/chains/{chainId}/borrowable-vaults`
  - Inputs: path `chainId`
  - Output: borrowable vaults list, marked legacy

### Vaults

- `GET /v3/vaults`
  - Inputs: `chainId`, `fields`, `sort`, `offset`, `limit`, `asset`, `minTvl`, `maxTvl`, `visibility`
  - Output: EVK vault list
  - Item fields from docs: `chainId`, `address`, `vaultType`, `name`, `symbol`, `decimals`, `asset { address, symbol, decimals, name? }`, `totalAssets`, `totalBorrows`, `totalSupplyUsd`, `totalBorrowsUsd`, `utilization`, `supplyApy`, `borrowApy`, `createdAt`, `snapshotTimestamp`
- `GET /v3/vaults/borrowable`
  - Inputs: `chainId`, `offset`, `limit`
  - Output: borrowable vault list
- `GET /v3/vaults/health/utilization`
  - Inputs: `chainId`, `threshold`, `onlyOverThreshold`, `offset`, `limit`
  - Output: utilization-health list
- `GET /v3/vaults/health/caps`
  - Inputs: `chainId`, `threshold`, `onlyOverThreshold`, `offset`, `limit`
  - Output: cap-usage-health list
- `GET /v3/vaults/{chainId}/{address}`
  - Inputs: path `chainId`, `address`; query `include`, `fields`, `blockNumber`
  - Output: EVK vault detail
  - Base fields from docs: list-item fields plus `dToken`, `oracle`, `unitOfAccount`, `creator`, `governor`, `supplyCap`, `borrowCap`, `totalShares`, `cash`, `interestRate`, `interestAccumulator`, `accumulatedFees`, `exchangeRate`, `createdAtBlock`
  - Optional expansions:
    - `collaterals`: items with `collateral`, `collateralName`, `collateralSymbol`, `asset`, `assetSymbol`, `assetDecimals`, `borrowLTV`, `liquidationLTV`, `initialLiquidationLTV`, `targetTimestamp`, `rampDuration`
    - `apy`: `{ current, history[] }` with `supplyApy`, `borrowApy`, `timestamp`
    - `totals`: `{ current, history[] }` with `totalAssets`, `totalBorrows`, `cash`, `utilization`, `supplyApy`, `borrowApy`, `timestamp`, `timestampIso`
    - `prices`: `asset` price object plus collateral price objects
- `GET /v3/vaults/{chainId}/{address}/labels`
  - Inputs: path `chainId`, `address`
  - Output: public curator labels
- `GET /v3/vaults/{chainId}/{address}/visibility`
  - Inputs: path `chainId`, `address`
  - Output: visibility status
- `GET /v3/vaults/{chainId}/{address}/positions`
  - Inputs: path `chainId`, `address`; query `offset`, `limit`, `addressPrefix`, `blockNumber`
  - Output: per-account positions in the vault
  - Item fields from docs: `account`, `shares`, `assets`, `assetsUsd`, `lastUpdatedBlock`
- `GET /v3/vaults/{chainId}/{address}/config-history`
  - Inputs: path `chainId`, `address`; query `from`, `to`, `offset`, `limit`, `type`
  - Output: unified config-change timeline
- `GET /v3/vaults/{chainId}/{address}/collaterals`
  - Inputs: path `chainId`, `address`
  - Output: current collateral list
  - Item fields from docs: `collateral`, `collateralName`, `collateralSymbol`, `asset`, `assetSymbol`, `assetDecimals`, `borrowLTV`, `liquidationLTV`, `initialLiquidationLTV`, `targetTimestamp`, `rampDuration`
- `GET /v3/vaults/{chainId}/{address}/ltv-history`
  - Inputs: path `chainId`, `address`; query `collateral`, `from`, `to`, `offset`, `limit`
  - Output: LTV history
- `GET /v3/vaults/{chainId}/{address}/cap-history`
  - Inputs: path `chainId`, `address`; query `from`, `to`, `offset`, `limit`
  - Output: cap history
- `GET /v3/vaults/{chainId}/{address}/irm-history`
  - Inputs: path `chainId`, `address`; query `from`, `to`, `offset`, `limit`
  - Output: interest-rate-model history
- `GET /v3/vaults/{chainId}/{address}/events`
  - Inputs: path `chainId`, `address`; query `from`, `to`, `type`, `offset`, `limit`
  - Output: unified core vault event timeline
- `GET /v3/vaults/{chainId}/{address}/totals`
  - Inputs: path `chainId`, `address`; query `from`, `to`, `resolution`, `sort`, `forceFresh`
  - Output: `{ current, history[] }` totals payload plus `meta` and `freshness`
- `GET /v3/vaults/{chainId}/{address}/holders`
  - Inputs: path `chainId`, `address`; query `offset`, `limit`
  - Output: holders list
- `GET /v3/vaults/{chainId}/{address}/debt-holders`
  - Inputs: path `chainId`, `address`; query `offset`, `limit`
  - Output: debt holders list
- `GET /v3/vaults/open-interest`
  - Inputs: `chainId`, `vault`, `account`, `from`, `to`, `resolution`, `offset`, `limit`
  - Output: open-interest rows

### Accounts

- `GET /v3/accounts/{address}/positions`
  - Inputs: path `address`; query `chainId`, `offset`, `limit`, `blockNumber`, `forceFresh`
  - Output: flattened account-vault positions plus `meta` and `freshness`
  - Item fields from docs: `chainId`, `account`, `vault`, `vaultType`, `shares?`, `debt?`, `assetsValue?`, `debtValue?`, `isController?`, `snapshot { timestamp?, timestampIso?, ageSeconds?, source?, method? }`
- `GET /v3/accounts/{address}/activity`
  - Inputs: path `address`; query `chainId`, `from`, `to`, `type`, `offset`, `limit`
  - Output: account activity timeline
- `GET /v3/accounts/{address}/sub-accounts`
  - Inputs: path `address`; query `chainId`, `offset`, `limit`
  - Output: sub-account list
  - Item fields from docs: `chainId`, `owner`, `addressPrefix`, `blockNumber`, `timestamp`

### Tokens

- `GET /v3/tokens`
  - Inputs: `chainId`, `fields`, `offset`, `limit`, `search`, `type`
  - Output: token list
  - Item fields from docs: `chainId`, `address`, `name`, `symbol`, `decimals`, `logoURI`, `priceUsd`, `metadata`, `groups`

### Prices

- `GET /v3/tokens/{chainId}/{address}/price`
  - Inputs: path `chainId`, `address`
  - Output: single token price
  - Fields from docs: `chainId`, `address`, `symbol`, `priceUsd`, `source`, `confidence`, `blockNumber`, `timestamp`
- `GET /v3/prices`
  - Inputs: `chainId`, `addresses`, deprecated `assets`
  - Output: token price list
  - Item fields from docs: `chainId`, `address`, `symbol`, `priceUsd`, `source`, `confidence`, `blockNumber`, `timestamp`
- `GET /v3/prices/history`
  - Inputs: `chainId`, `addresses`, `from`, `to`, `resolution`, `sort`
  - Output: historical price series

### APYs

- `GET /v3/vaults/{chainId}/{address}/apy`
  - Inputs: path `chainId`, `address`; query `from`, `to`, `resolution`, `sort`
  - Output: `{ current, history[] }` for `supplyApy`, `borrowApy`, plus metadata
- `GET /v3/apys/intrinsic`
  - Inputs: `chainId`, `vault`, `offset`, `limit`
  - Output: intrinsic APY rows
- `GET /v3/apys/intrinsic/history`
  - Inputs: `chainId`, `vault`, `from`, `to`, `resolution`, `sort`
  - Output: intrinsic APY history

### Rewards

- `GET /v3/apys/rewards`
  - Inputs: `chainId`, `vault`, `account`, `offset`, `limit`
  - Output: rewards APY rows
- `GET /v3/apys/rewards/history`
  - Inputs: `chainId`, `vault`, `account`, `from`, `to`, `resolution`, `sort`
  - Output: rewards APY history
- `GET /v3/rewards/breakdown`
  - Inputs: `chainId`, required `account`, optional `vault`
  - Output: reward breakdown rows

### Oracles

- `GET /v3/oracles/adapters`
  - Inputs: `chainId`, `offset`, `limit`
  - Output: whitelisted adapter rows
- `GET /v3/oracles/prices`
  - Inputs: required `chainId`; optional `vault`, `asset`, `offset`, `limit`
  - Output:
    - exact mode: `{ chainId, vault, asset, priceUsd, source, timestamp }`
    - list mode: flat rows for vault/asset tuples
- `GET /v3/oracles/routers`
  - Inputs: required `chainId`; optional `vault`, `adapter`, `offset`, `limit`
  - Output: router-state rows
- `GET /v3/oracles/historical-adapters`
  - Inputs: required `chainId`; `offset`, `limit`
  - Output: historical adapter rows

### Earn

- `GET /v3/earn/vaults`
  - Inputs: `chainId`, `offset`, `limit`
  - Output: earn vault list
  - Docs currently expose only `data[]` without documented item fields in the rendered schema block
- `GET /v3/earn/vaults/{chainId}/{address}`
  - Inputs: path `chainId`, `address`; query `include`
  - Output: earn vault detail
  - Rendered docs example exposes optional `apy`, `totals`, `prices`; base fields are not documented in the rendered 200 schema block
- `GET /v3/earn/vaults/{chainId}/{address}/events`
  - Inputs: path `chainId`, `address`; query `from`, `to`, `type`, `offset`, `limit`
  - Output: earn-vault event timeline

### Swap

- `GET /v3/swap/pools`
  - Inputs: `chainId`, `offset`, `limit`
  - Output: swap pool list
- `GET /v3/swap/total-volume`
  - Inputs: `chainId`, `from`, `to`
  - Output: total swap volume in USD
- `GET /v3/swap/pair-tvl`
  - Inputs: `chainId`
  - Output: pair TVL

### Governance

- `GET /v3/governance/pending-actions`
  - Inputs: `chainId`
  - Output: pending governance actions
- `GET /v3/governance/executed-actions`
  - Inputs: `chainId`, `from`, `to`, `includeData`, `offset`, `limit`
  - Output: executed governance actions
- `GET /v3/governance/role-changes`
  - Inputs: `chainId`, `address`
  - Output: role changes

### Liquidations

- `GET /v3/liquidations`
  - Inputs: `chainId`, `vault`, `violator`, `liquidator`, required `from`, required `to`, `sort`, `offset`, `limit`
  - Output: liquidation events

### Terms of Use

- `GET /v3/terms-of-use/signatures`
  - Inputs: `chainId`, `address`, `offset`, `limit`
  - Output: signature history
- `GET /v3/terms-of-use/check/{address}`
  - Inputs: path `address`; query `chainId`
  - Output: signature-state check

### EVC

- `GET /v3/evc/accounts/{address}/events`
  - Inputs: path `address`; required `chainId`, `from`, `to`; optional `type`, `offset`, `limit`
  - Output: EVC event timeline

### Public Allocator

- `GET /v3/public-allocator/events`
  - Inputs: required `chainId`, `from`, `to`; optional `type`, `offset`, `limit`
  - Output: public-allocator event timeline

### Fee Flow

- `GET /v3/fee-flow/events`
  - Inputs: required `chainId`, `from`, `to`; optional `type`, `offset`, `limit`
  - Output: fee-flow event timeline

### GraphQL

- `GET /v3/graphql`
  - Inputs: required `query`; optional `variables`, `operationName`
  - Output: GraphQL result object
- `POST /v3/graphql`
  - Inputs: body `operationName`, `query`, `variables`
  - Output: GraphQL result object

## Adapter-relevant schema extraction

### Current SDK entity requirements

Account construction in the SDK currently expects data from:

- [`accountInfoConverter.ts`](../src/services/accountService/adapters/accountInfoConverter.ts)
  - sub-account: `timestamp`, `account`, `owner`, `lastAccountStatusCheckTimestamp`, `enabledControllers`, `enabledCollaterals`
  - per-position: `vaultAddress`, `asset`, `shares`, `assets`, `borrowed`, `isController`, `isCollateral`, `balanceForwarderEnabled`
  - liquidity: `unitOfAccount`, `daysToLiquidation`, liability values, total collateral values, per-collateral values

EVault construction currently expects data from:

- [`vaultInfoConverter.ts`](../src/services/vaults/eVaultService/adapters/vaultInfoConverter.ts)
  - base ERC4626 fields
  - `unitOfAccount`, `totalCash`, `totalBorrowed`
  - `creator`, `governorAdmin`, `dToken`, `balanceTracker`
  - fee detail: `interestFee`, `accumulatedFeesShares`, `accumulatedFeesAssets`, `governorFeeReceiver`, `protocolFeeReceiver`, `protocolFeeShare`
  - hooks: `hookTarget`, hooked-operation booleans
  - caps, liquidation config, oracle metadata, interest-rate metadata, collateral oracle prices and ramps, `timestamp`

Euler Earn construction currently expects data from:

- [`eulerEarnInfoConverter.ts`](../src/services/vaults/eulerEarnService/adapters/eulerEarnInfoConverter.ts)
  - base ERC4626 fields
  - `lostAssets`, `availableAssets`, `performanceFee`
  - governance fields and pending governance changes
  - `supplyQueue`
  - strategy list with strategy token metadata, `allocatedAssets`, `availableAssets`, allocation caps, `removableAt`
  - `timestamp`

Securitize collateral vault construction currently expects data from:

- [`securitizeVaultInfoConverter.ts`](../src/services/vaults/securitizeVaultService/adapters/securitizeVaultInfoConverter.ts)
  - base ERC4626 fields
  - `governor`
  - `supplyCap`

Vault-type routing currently expects:

- [`IVaultTypeAdapter.ts`](../src/services/vaults/vaultMetaService/adapters/IVaultTypeAdapter.ts)
  - `vault -> factory`

### Coverage by entity

#### 1. `Account` / sub-account adapters

Available in v3:

- `/v3/accounts/{address}/positions`
  - `chainId`, `account`, `vault`, `vaultType`
  - `shares?`, `debt?`
  - `assetsValue?`, `debtValue?`
  - `isController?`
  - snapshot freshness metadata
- `/v3/accounts/{address}/sub-accounts`
  - `chainId`, `owner`, `addressPrefix`, `blockNumber`, `timestamp`

Missing relative to current SDK entity:

- raw `asset` address per position
- raw `assets` amount per position
- raw `borrowed` amount if `debt` is not intended as the same field
- `isCollateral`
- `balanceForwarderEnabled`
- `lastAccountStatusCheckTimestamp`
- `enabledControllers[]`
- `enabledCollaterals[]`
- full liquidity object
  - `unitOfAccount`
  - `daysToLiquidation`
  - liability values
  - total collateral values
  - per-collateral liquidity breakdown

Conclusion:

- Not sufficient to recreate the current `Account` / `SubAccount` entity.
- It is sufficient for a new flattened account-position adapter, but not for replacing the current nested account adapter one-for-one in output capability.

#### 2. `EVault` adapter

Available in v3:

- `/v3/vaults`
  - core ERC4626 shell and market summary
- `/v3/vaults/{chainId}/{address}`
  - core EVK detail: `dToken`, `oracle`, `unitOfAccount`, `creator`, `governor`, `supplyCap`, `borrowCap`, `totalShares`, `cash`, `interestRate`, `interestAccumulator`, `accumulatedFees`, `exchangeRate`, `createdAtBlock`
  - optional `collaterals`, `apy`, `totals`, `prices`
- `/v3/vaults/{chainId}/{address}/collaterals`
  - collateral list with LTV ramp fields
- `/v3/vaults/{chainId}/{address}/totals`
  - current/historical totals with freshness
- `/v3/vaults/{chainId}/{address}/apy`
  - current/historical APY
- `/v3/prices` and `/v3/tokens/{chainId}/{address}/price`
  - token prices

Missing relative to current SDK entity:

- `balanceTracker`
- detailed fee breakdown
  - `accumulatedFeesShares`
  - `accumulatedFeesAssets`
  - `governorFeeReceiver`
  - `protocolFeeReceiver`
  - `protocolFeeShare`
  - current docs expose only a single `accumulatedFees`
- `interestFee` as a normalized percentage
- hook data
  - `hookTarget`
  - hooked-operation booleans
- liquidation config
  - `maxLiquidationDiscount`
  - `liquidationCoolOffTime`
  - `socializeDebt`
- `evcCompatibleAsset`
- oracle metadata richness
  - adapter chain / decoded adapter set
  - oracle display name
- interest-rate-model detail
  - current model address
  - model type
  - decoded IRM params
- collateral oracle raw price structure expected by SDK
  - mid/bid/ask
  - query failure fields
- liability oracle raw price structure expected by SDK
- docs expose `governor`, but current SDK expects `governorAdmin`; these may map semantically, but the docs describe a fallback behavior, so it is not a strict equivalence

Conclusion:

- Sufficient for a reduced EVault adapter aimed at UI summary/detail pages.
- Not sufficient to recreate the current `EVault` entity as-is.

#### 3. `EulerEarn` adapter

Available in v3 docs:

- `/v3/earn/vaults`
  - list exists, but the rendered schema does not document item fields
- `/v3/earn/vaults/{chainId}/{address}`
  - docs only expose optional `apy`, `totals`, `prices` in the rendered 200 example/schema surface

Missing relative to current SDK entity:

- base earn vault fields are under-documented in the rendered docs
- `lostAssets`
- `availableAssets`
- `performanceFee`
- governance block
  - `owner`, `creator`, `curator`, `guardian`, `feeReceiver`
  - `timelock`, pending timelock, pending guardian timings
- `supplyQueue`
- strategies array and all nested strategy fields

Conclusion:

- Not sufficient to replace the current Euler Earn adapter.
- The rendered docs themselves appear incomplete for this surface.

#### 4. `SecuritizeCollateralVault` adapter

Available in v3:

- account positions rows include `vaultType` enum values `evk | earn | securitize`

Missing:

- no dedicated securitize list/detail route was documented in the rendered v3 docs
- no documented securitize vault detail fields for `governor` and `supplyCap`
- EVK vault list/detail explicitly document `vaultType: "evk"` for that surface

Conclusion:

- Not sufficient to replace the securitize adapter.

#### 5. Vault type / factory adapter

Current SDK requirement:

- `vault -> factory` mapping, used by [`vaultMetaService.ts`](../src/services/vaults/vaultMetaService/vaultMetaService.ts) to dispatch to the correct service

Available in v3:

- `vaultType` is present on account-position rows
- EVK vault endpoints are clearly EVK-only

Missing:

- no generic `vault -> factory` endpoint
- no generic `vault -> type` endpoint for arbitrary addresses
- no documented route for routing an unknown vault address across EVK / Earn / Securitize families

Conclusion:

- Current factory-based `IVaultTypeAdapter` cannot be replaced directly from documented v3 data.
- A type-based replacement is possible only if SDK routing changes and v3 adds a generic classification endpoint or guarantees family coverage across detail endpoints.

## Replacement feasibility

### Adapters that can plausibly be added now

- `V3EVaultSummaryAdapter`
  - Backed by `/v3/vaults`, `/v3/vaults/{chainId}/{address}`, `/v3/vaults/{chainId}/{address}/apy`, `/v3/vaults/{chainId}/{address}/totals`, `/v3/vaults/{chainId}/{address}/collaterals`, `/v3/prices`
  - Output would need to be a reduced entity, not the current `IEVault`
- `V3FlatAccountPositionsAdapter`
  - Backed by `/v3/accounts/{address}/positions` and `/v3/accounts/{address}/sub-accounts`
  - Output would be a new flattened account model, not the current nested `ISubAccount`

### Adapters blocked on missing API data

- full `Account` adapter
- full `EVault` adapter compatible with the current entity
- full `EulerEarn` adapter
- full `SecuritizeCollateralVault` adapter
- current `IVaultTypeAdapter` replacement

## API additions needed for full replacement

### For `Account`

- per-position `asset`
- per-position `assets` and `borrowed` raw amounts with clear semantics
- `isCollateral`
- `balanceForwarderEnabled`
- account-level `lastAccountStatusCheckTimestamp`
- account-level `enabledControllers[]`
- account-level `enabledCollaterals[]`
- liquidity payload matching current risk fields

### For `EVault`

- `balanceTracker`
- fee receiver fields and protocol/governor fee split
- `interestFee`
- hook target and hooked operation matrix
- liquidation config fields
- `evcCompatibleAsset`
- oracle adapter graph / decoded adapter data
- explicit current IRM object with type and params
- raw oracle price fields expected by the SDK

### For `EulerEarn`

- fully documented 200 schema for `/v3/earn/vaults` and `/v3/earn/vaults/{chainId}/{address}`
- governance block
- strategy list with allocation caps and token metadata
- `lostAssets`, `availableAssets`, `performanceFee`, `supplyQueue`, `timestamp`

### For `Securitize`

- dedicated securitize vault detail/list endpoints or inclusion in a generic vault detail surface
- `governor`
- `supplyCap`

### For vault routing

- a generic `vault -> type` endpoint for arbitrary `(chainId, address)` pairs, or
- a generic `vault -> factory` endpoint, if the SDK keeps factory-based dispatch

## Bottom line

- v3 already supports a useful summary-oriented EVK data adapter and a flattened account-position adapter.
- v3 does not currently expose enough documented data to replace the SDK's existing account adapter, EVault adapter, Euler Earn adapter, securitize adapter, or factory-based vault-type adapter without changing the target entities.
- The biggest blockers are account risk/liquidity detail, EVault fee/hook/IRM/oracle richness, missing securitize detail routes, and incomplete rendered docs for Earn detail.
