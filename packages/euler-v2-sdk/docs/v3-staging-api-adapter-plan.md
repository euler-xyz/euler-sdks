# Euler Data V3 Staging Review For SDK Adapters

Reviewed on 2026-03-18 against `https://v3staging.eul.dev/v3/docs`.

Scope:
- Endpoint inventory came from the rendered Scalar docs UI, not from the raw `openapi.json`.
- Schema notes came from the docs' rendered "Show Schema" blocks plus live sampled responses where rate limits allowed.
- Live probing hit the free-tier rate limit (`429 RATE_LIMIT_EXCEEDED`) after a small number of requests, so a few earn/detail assumptions still need one follow-up verification pass.

## Global API Notes

- Base path is `/v3`.
- Addresses are accepted lowercase or checksum; responses are checksummed.
- On-chain numeric values are stringified integers.
- USD prices are numbers with 8 decimal places.
- APYs and ratios are numbers with 6 decimal places.
- Errors use `{ error: { code, message, requestId, details? } }`.
- Standard list/detail responses use `meta` with at least `timestamp`, usually `total`, `offset`, `limit`, and sometimes `chainId`.
- Some freshness-sensitive endpoints also return `freshness`.

## Common Response Shapes

### List envelope

Observed on `/v3/chains`, `/v3/vaults`, `/v3/accounts/.../positions`:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "offset": 0,
    "limit": 20,
    "timestamp": "2026-03-18T17:45:06.104Z",
    "chainId": "1"
  }
}
```

### Detail envelope

Observed on `/v3/vaults/{chainId}/{address}`:

```json
{
  "data": {},
  "meta": {
    "offset": 0,
    "limit": 20,
    "timestamp": "2026-03-18T17:45:23.670Z"
  }
}
```

### Freshness envelope

Observed on `/v3/accounts/{address}/positions` and `/v3/vaults/{chainId}/{address}/totals`:

```json
{
  "freshness": {
    "latestSnapshotTimestamp": 1773801499,
    "ageSeconds": 54410,
    "timestamp": "2026-03-18T17:45:09.024Z",
    "mode": "cached",
    "forceFreshRequested": false,
    "refreshTriggered": false,
    "refreshCompleted": false,
    "timedOut": false,
    "rateLimited": false,
    "fallbackReason": null,
    "waitedMs": 0
  }
}
```

### Time-series envelope

Observed on `/v3/vaults/{chainId}/{address}/totals`:

```json
{
  "data": {
    "current": {},
    "history": []
  },
  "meta": {
    "chainId": 1,
    "vault": "0x...",
    "resolution": "1d",
    "startTimestamp": 1700000000,
    "endTimestamp": 1800000000,
    "timestamp": "2026-03-18T17:45:24.152Z",
    "note": "Historical values are raw amounts. Compose with /v3/prices for USD conversion."
  },
  "freshness": {}
}
```

## Endpoint Inventory

### Protocol

- `GET /v3`
- `GET /v3/openapi.json`
- `GET /v3/docs`
- `GET /v3/protocol/stats`

### Health

- `GET /v3/health`
- `GET /v3/health/detailed`
- `GET /v3/health/live`
- `GET /v3/health/ready`
- `GET /v3/metrics`

### Auth

- `POST /v3/admin/api-keys`
- `GET /v3/admin/api-keys`
- `GET /v3/admin/api-keys/{id}`
- `PATCH /v3/admin/api-keys/{id}`
- `DELETE /v3/admin/api-keys/{id}`
- `GET /v3/admin/api-keys/{id}/usage`

### Curator

- `GET /v3/curator/vaults`
- `PUT /v3/curator/vaults/{chainId}/{address}/labels`

### Usage

- `GET /v3/usage/stats`

### Chains

- `GET /v3/chains`
- `GET /v3/chains/{chainId}/stats`
- `GET /v3/chains/{chainId}/borrowable-vaults`

### Vaults

- `GET /v3/vaults`
- `GET /v3/vaults/borrowable`
- `GET /v3/vaults/health/utilization`
- `GET /v3/vaults/health/caps`
- `GET /v3/vaults/{chainId}/{address}`
- `GET /v3/vaults/{chainId}/{address}/labels`
- `GET /v3/vaults/{chainId}/{address}/visibility`
- `GET /v3/vaults/{chainId}/{address}/positions`
- `GET /v3/vaults/{chainId}/{address}/config-history`
- `GET /v3/vaults/{chainId}/{address}/collaterals`
- `GET /v3/vaults/{chainId}/{address}/ltv-history`
- `GET /v3/vaults/{chainId}/{address}/cap-history`
- `GET /v3/vaults/{chainId}/{address}/irm-history`
- `GET /v3/vaults/{chainId}/{address}/events`
- `GET /v3/vaults/{chainId}/{address}/totals`
- `GET /v3/vaults/{chainId}/{address}/holders`
- `GET /v3/vaults/{chainId}/{address}/debt-holders`
- `GET /v3/vaults/open-interest`

### Accounts

- `GET /v3/accounts/{address}/positions`
- `GET /v3/accounts/{address}/activity`
- `GET /v3/accounts/{address}/sub-accounts`

### Tokens

- `GET /v3/tokens`
- `GET /v3/tokens/{chainId}/{address}/price`

### Prices

- `GET /v3/prices`
- `GET /v3/prices/history`

### APYs

- `GET /v3/vaults/{chainId}/{address}/apy`
- `GET /v3/apys/intrinsic`
- `GET /v3/apys/intrinsic/history`
- `GET /v3/apys/rewards`
- `GET /v3/apys/rewards/history`

### Rewards

- `GET /v3/rewards/breakdown`

### Oracles

- `GET /v3/oracles/adapters`
- `GET /v3/oracles/prices`
- `GET /v3/oracles/routers`
- `GET /v3/oracles/historical-adapters`

### Earn

- `GET /v3/earn/vaults`
- `GET /v3/earn/vaults/{chainId}/{address}`
- `GET /v3/earn/vaults/{chainId}/{address}/events`

### Swap

- `GET /v3/swap/pools`
- `GET /v3/swap/total-volume`
- `GET /v3/swap/pair-tvl`

### Governance

- `GET /v3/governance/pending-actions`
- `GET /v3/governance/executed-actions`
- `GET /v3/governance/role-changes`

### Liquidations

- `GET /v3/liquidations`

### Terms Of Use

- `GET /v3/terms-of-use/signatures`
- `GET /v3/terms-of-use/check/{address}`

### EVC / Allocator / Fee Flow

- `GET /v3/evc/accounts/{address}/events`
- `GET /v3/public-allocator/events`
- `GET /v3/fee-flow/events`

### GraphQL

- `GET /v3/graphql`
- `POST /v3/graphql`

## Model And Schema Notes Relevant To SDK Adapters

### Chains

Live `/v3/chains?` sample:

```json
{
  "id": 1,
  "name": "ethereum",
  "status": "active"
}
```

### Vault list summary

Live `/v3/vaults?chainId=1&limit=1` sample:

```json
{
  "chainId": 1,
  "address": "0x00011d9A1EB3d7278b8DF2391e2E32f6f9bcF293",
  "vaultType": "evk",
  "name": "EVK Vault ePT-USDS-14AUG2025-2",
  "symbol": "ePT-USDS-14AUG2025-2",
  "decimals": 18,
  "asset": {
    "address": "0xFfEc096c087C13Cc268497B89A613cACE4DF9A48",
    "symbol": "PT-USDS-14AUG2025",
    "decimals": 18,
    "name": "PT USDS Stablecoin 14AUG2025"
  },
  "totalAssets": "0",
  "totalBorrows": "0",
  "totalSupplyUsd": 0,
  "totalBorrowsUsd": 0,
  "utilization": 0,
  "supplyApy": 0,
  "borrowApy": 0,
  "snapshotTimestamp": "2026-03-18T17:04:37.000Z",
  "createdAt": "2025-07-09T21:17:23.000Z"
}
```

Docs-rendered list schema also shows `shares` and `asset` fields, but live list responses currently omit `shares`.

### EVault detail

Live `/v3/vaults/{chainId}/{address}` sample includes nearly all fields needed for `IEVault`:

- ERC4626 core: `chainId`, `address`, `name`, `symbol`, `decimals`, `shares`, `asset`, `totalShares`, `totalAssets`
- EVault core: `dToken`, `creator`, `governor`, `governorAdmin`, `balanceTracker`
- balances: `totalBorrows`, `totalBorrowed`, `totalCash`, `cash`, `accumulatedFees`
- fees: `fees.interestFee`, `accumulatedFeesShares`, `accumulatedFeesAssets`, `governorFeeReceiver`, `protocolFeeReceiver`, `protocolFeeShare`
- hooks: `hooks.hookedOperations.*`, `hooks.hookTarget`
- caps: top-level `supplyCap`, `borrowCap` and nested `caps.supplyCap`, `caps.borrowCap`
- liquidation: `maxLiquidationDiscount`, `liquidationCoolOffTime`, `socializeDebt`
- rates: `interestRate`, `interestAccumulator`, `interestRates.borrowSPY`, `interestRates.borrowAPY`, `interestRates.supplyAPY`
- IRM: `interestRateModel.address`, `interestRateModel.type`, `interestRateModel.data`
- oracle: `oracle.oracle`, `oracle.name`, `oracle.adapters[]`
- UoA: `unitOfAccount`
- price snapshot: `oraclePriceRaw`
- analytics: `totalSupplyUsd`, `totalBorrowsUsd`, `utilization`, `supplyApy`, `borrowApy`
- timestamps: `timestamp`, `snapshotTimestamp`, `createdAtBlock`, `createdAt`

Important gap:
- Live detail did not include `collaterals`; that appears to come from `GET /v3/vaults/{chainId}/{address}/collaterals`.

### Vault collaterals

Docs models show `CollateralConfig` and `VaultCollateralDetail`.

Expected use:
- `GET /v3/vaults/{chainId}/{address}/collaterals`
- Build `EVault.collaterals[]`
- Each row should carry at least collateral vault address, LTV config, and price-related data.

Live sample on a zero-collateral vault returned:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "offset": 0,
    "limit": 0,
    "timestamp": "2026-03-18T17:45:23.964Z",
    "chainId": "1"
  }
}
```

### Vault totals series

Live `/v3/vaults/{chainId}/{address}/totals` sample:

- `data.current.totalAssets`
- `data.current.totalBorrows`
- `data.current.cash`
- `data.current.utilization`
- `data.current.supplyApy`
- `data.current.borrowApy`
- `data.current.timestamp`
- `data.current.timestampIso`
- `data.history[]` repeats that shape

This is useful for charting, not for base entity construction.

### Account positions

Docs-rendered `/v3/accounts/{address}/positions` schema is the most important source for replacing the account adapter.

Rendered schema:

```json
{
  "chainId": 1,
  "account": "string",
  "vault": "string",
  "vaultType": "evk",
  "asset": "string",
  "shares": "string",
  "assets": "string",
  "borrowed": "string",
  "debt": "string",
  "assetsValue": "string",
  "debtValue": "string",
  "isCollateral": true,
  "balanceForwarderEnabled": true,
  "isController": true,
  "liquidity": {
    "vaultAddress": "string",
    "unitOfAccount": "string",
    "daysToLiquidation": 1,
    "liabilityValue": {
      "borrowing": "string",
      "liquidation": "string",
      "oracleMid": "string"
    },
    "totalCollateralValue": {
      "borrowing": "string",
      "liquidation": "string",
      "oracleMid": "string"
    },
    "collaterals": [
      {
        "address": "string",
        "value": {
          "borrowing": "string",
          "liquidation": "string",
          "oracleMid": "string"
        }
      }
    ]
  },
  "subAccount": {
    "owner": "string",
    "timestamp": 1,
    "lastAccountStatusCheckTimestamp": 1,
    "enabledControllers": ["string"],
    "enabledCollaterals": ["string"],
    "isLockdownMode": true,
    "isPermitDisabledMode": true
  },
  "snapshot": {
    "timestamp": 1,
    "timestampIso": "2026-03-18T17:40:48.414Z",
    "ageSeconds": 1,
    "source": "string",
    "method": "string"
  }
}
```

This is enough to construct:
- `IAccountPosition`
- `IAccountLiquidity`
- `AccountLiquidityCollateral`
- `ISubAccount` metadata

It also removes the current need for separate lens calls for EVC account state and vault account state.

### Account sub-accounts

Docs models expose `SubAccount`.

Expected use:
- `GET /v3/accounts/{address}/sub-accounts`
- enumerate owner-level subaccounts before calling or filtering positions

Needs one live verification pass because rate limits prevented sampling.

### Account activity

Docs models expose `AccountActivity`.

Expected use:
- `GET /v3/accounts/{address}/activity`
- fallback discovery endpoint if positions are empty but SDK still wants known vault tuples

This is likely optional for the first adapter pass because `/positions` already carries the richer entity input.

### Earn vault list

Live `/v3/earn/vaults?chainId=1&limit=1` sample:

```json
{
  "chainId": 1,
  "address": "0x21d3CeeAcced883d72f02f7D04Fb45218cAF8E27",
  "name": "Clearstar Core USDT0",
  "symbol": "CSCOREUSDT0",
  "decimals": 18,
  "asset": {
    "address": "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb",
    "decimals": 18
  },
  "totalAssets": "0",
  "totalSupplyUsd": 0,
  "supplyApy": null,
  "utilization": 0,
  "strategyCount": 0,
  "createdAt": "2025-11-06T09:30:11.000Z"
}
```

Docs quirk:
- the rendered list schema for `/v3/earn/vaults` showed `data: [{}]`, which is clearly under-specified.
- live data is the reliable shape here.

### Earn vault detail

Docs say `GET /v3/earn/vaults/{chainId}/{address}` supports `include=apy,totals,prices`.

Rendered example schema only showed:

```json
{
  "data": {
    "apy": null,
    "totals": null,
    "prices": null
  },
  "meta": {}
}
```

That is not sufficient to infer the real base object.

Open questions for one follow-up live read:
- Does detail include `lostAssets`, `availableAssets`, `performanceFee`, `supplyQueue`, `governance`, and `strategies[]`?
- Does each strategy row contain enough to build `EulerEarnStrategyInfo` directly?

### Securitize / non-EVK vaults

The vault APIs appear unified under `/v3/vaults`, keyed by `vaultType`.

What still needs verification:
- actual `vaultType` values beyond `"evk"`
- whether non-EVK detail includes `governor` and `supplyCap`

This matters because `SecuritizeCollateralVault` currently requires both.

## Adapter Plan

### 1. Add API client wrappers first

Create lightweight HTTP adapters for:
- account API
- vault API
- earn API
- optional vault-type resolver API

Requirements:
- shared fetch helper
- typed envelopes
- rate-limit aware error translation into `DataIssue`
- support for `forceFresh`, pagination, and `include`

### 2. Replace account discovery with `/accounts/.../positions`

New account adapter plan:
- `fetchAccount(chainId, owner)` calls `/v3/accounts/{owner}/positions?chainId=...`
- group rows by `row.account` to reconstruct `subAccounts`
- derive owner-level flags from embedded `subAccount`
- build `positions[]` directly from each row
- build `liquidity` directly from each row

`fetchSubAccount(chainId, subAccount, vaults?)` plan:
- derive primary owner from the sub-account address
- call owner-scoped `/positions`
- filter rows where `row.account === subAccount`
- if `vaults` is passed, filter again by `row.vault`

Why this is better than the current path:
- one payload already includes shares, assets, borrowed, controller/collateral flags, liquidity, and sub-account metadata
- no need for subgraph tuple discovery + per-vault lens fanout

### 3. Build EVault entities from detail + collaterals

New EVault adapter plan:
- primary call: `GET /v3/vaults/{chainId}/{address}`
- secondary call: `GET /v3/vaults/{chainId}/{address}/collaterals`
- merge both responses into `IEVault`

Field mapping:
- base ERC4626 fields come from detail
- `fees`, `hooks`, `caps`, `liquidation`, `interestRates`, `interestRateModel`, `oracle`, `oraclePriceRaw` come from detail
- `collaterals[]` comes from collaterals endpoint

If the collaterals endpoint only returns addresses + config:
- leave `collateral.vault` unresolved
- let `populateCollaterals()` resolve nested vault entities through `vaultMetaService`

### 4. Add an API-backed vault type resolver

Current `vaultMetaService` needs a way to route unknown vault addresses.

Preferred plan:
- add a new resolver adapter that probes APIs in order:
- try `/v3/vaults/{chainId}/{address}`
- if 404, try `/v3/earn/vaults/{chainId}/{address}`
- if vault detail succeeds, map `vaultType`
- if earn detail succeeds, map to `VaultType.EulerEarn`

If v3 eventually exposes a cheap address-to-type endpoint, use that instead.

### 5. Build EulerEarn from earn detail, not the list endpoint

New EulerEarn adapter plan:
- detail call: `GET /v3/earn/vaults/{chainId}/{address}`
- optional `include=apy,totals,prices`

What the adapter needs to confirm from live detail:
- governance block
- strategies array
- performance fee
- lost / available assets
- timestamps

If detail returns strategy addresses but not full nested EVault data:
- keep strategies as unresolved `address + vaultType + amounts`
- let `populateStrategyVaults()` continue to hydrate via `eVaultService`

### 6. Decide how to handle Securitize vaults before implementation

There are two valid approaches.

Option A:
- only move EVault and EulerEarn to v3 now
- keep Securitize on the current onchain adapter until v3 proves it returns `governor` and `supplyCap`

Option B:
- introduce a partial API-backed Securitize adapter
- relax entity requirements or add explicit fallback/default behavior

Recommendation:
- choose Option A first
- the v3 review so far is not enough to prove Securitize parity

### 7. Preserve service-level population boundaries

The new adapters should only create base entities from v3 payloads.

Do not fold in:
- market prices
- rewards
- intrinsic APY
- labels
- strategy vault hydration
- collateral vault hydration

Those should stay in the existing population steps so service semantics remain stable.

### 8. Handle rate limiting explicitly

Observed behavior:
- staging free tier is easy to trip during adapter fanout
- earn detail requests returned `429 RATE_LIMIT_EXCEEDED` with `details.retryAfter`

Implementation guidance:
- surface `retryAfter` in `DataIssue.originalValue`
- avoid per-vault N+1 calls where a list endpoint can seed the next step
- batch at the SDK query layer with `buildQuery`

## Recommended Implementation Order

1. Add a minimal shared v3 REST client and envelope types.
2. Implement a new API-backed account adapter using `/accounts/{address}/positions`.
3. Implement a new API-backed EVault adapter using detail + collaterals.
4. Implement a new API-backed vault-type resolver for `vaultMetaService`.
5. Implement a new API-backed EulerEarn adapter after one more live detail verification pass.
6. Leave Securitize on the current adapter until v3 parity is confirmed.

## Follow-Up Checks Before Coding

- Sample one non-empty account from `/v3/accounts/{address}/positions` and verify row-to-`IAccountPosition` mapping end to end.
- Sample `/v3/accounts/{address}/sub-accounts` and confirm whether the request address is the owner or can be a sub-account.
- Sample `/v3/earn/vaults/{chainId}/{address}` after rate-limit reset and verify the full detail shape.
- Sample one non-EVK vault from `/v3/vaults/{chainId}/{address}` to confirm whether Securitize-compatible fields exist.
