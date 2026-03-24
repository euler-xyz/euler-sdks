# SDK vs App Vault Cross-Reference

Generated on 2026-03-24.

## Scope and method

- App truth source:
  - Classic/eVault discovery: `POST https://indexer.euler.finance/v2/vault/list`
  - Classic/eVault detail enrichment used by the app: `GET https://app.euler.finance/api/v1/vault`
  - App classic detail-page path in code: `packages/wagmi-evc/src/actions/getVault.ts` plus `apps/lend/src/app/features/vaults/hooks.ts`
  - Earn discovery/detail: `GET https://indexer.euler.finance/v1/earn/vaults`
- SDK source:
  - `eVaultService.fetchAllVaults(chainId, { options: ... })`
  - `eulerEarnService.fetchAllVaults(chainId, { options: ... })`
- Numerical discrepancy threshold: `> 1%`
- App-visible vaults were compared chain-by-chain. If a vault existed in the app but not in SDK `fetchAllVaults`, it was counted as `missing_in_sdk`.

## Field mapping

### Classic / EVault

| App field | App source | SDK field | Notes |
| --- | --- | --- | --- |
| `vault` | v2 list / api v1 vault | `address` | exact address match |
| `vaultName` | v2 list | `shares.name` | compared as text |
| `vaultSymbol` | v2 list | `shares.symbol` | compared as text |
| `vaultDecimals` | v2 list | `shares.decimals` | numeric |
| `asset` | v2 list | `asset.address` | exact address match |
| `assetSymbol` | v2 list | `asset.symbol` | compared as text |
| `assetDecimals` | v2 list | `asset.decimals` | numeric |
| `totalAssets` | v2 list / detail | `totalAssets` | bigint |
| `totalShares` | v2 list / detail | `totalShares` | bigint |
| `totalBorrows` | v2 list / detail | `totalBorrowed` | bigint |
| `cash` | v2 list / detail | `totalCash` | bigint |
| `supplyCap` | v2 list / detail | `caps.supplyCap` | app often uses `null` for uncapped |
| `borrowCap` | v2 list / detail | `caps.borrowCap` | app often uses `null` for uncapped |
| `utilization` | v2 list | derived from `totalBorrowed / totalAssets` | compared as percentage ratio |
| `assetPrice` | v2 list | `marketPriceUsd` | SDK converted from wad to USD |
| `totalAssetsUSD` | v2 list | derived from `totalAssets * marketPriceUsd` | numeric |
| `cashUSD` | v2 list | derived from `totalCash * marketPriceUsd` | numeric |
| `supplyApy.baseApy` | v2 list | `interestRates.supplyAPY * 100` | app reports percent |
| `borrowApy.baseApy` | v2 list | `interestRates.borrowAPY * 100` | app reports percent |
| `supplyApy.rewardApy` | v2 list | `rewards.totalRewardsApr * 100` | app reports percent |
| `intrinsicApy.apy` | v2 list | `intrinsicApy.apy` | compared directly |
| `governorAdmin` | v2 list / detail | `governorAdmin` | exact address |
| `collateralLTVInfo[*]` | api v1 vault | `collaterals[*]` | address + borrow/liquidation LTV |

### Earn

| App field | App source | SDK field | Notes |
| --- | --- | --- | --- |
| `vault` | v1 earn vaults | `address` | exact address match |
| `vaultName` | v1 earn vaults | `shares.name` | text |
| `vaultSymbol` | v1 earn vaults | `shares.symbol` | text |
| `vaultDecimals` | v1 earn vaults | `shares.decimals` | numeric |
| `asset` | v1 earn vaults | `asset.address` | exact address |
| `assetSymbol` | v1 earn vaults | `asset.symbol` | text |
| `assetDecimals` | v1 earn vaults | `asset.decimals` | numeric |
| `totalAssets` | v1 earn vaults | `totalAssets` | bigint |
| `totalShares` | v1 earn vaults | `totalShares` | bigint |
| `lostAssets` | v1 earn vaults | `lostAssets` | bigint |
| `availableAssets` | v1 earn vaults | `availableAssets` | bigint |
| `performanceFee` | v1 earn vaults | `performanceFee` | scale mismatch or missing in SDK |
| `owner` | v1 earn vaults | `governance.owner` | exact address |
| `creator` | v1 earn vaults | `governance.creator` | exact address |
| `curator` | v1 earn vaults | `governance.curator` | exact address |
| `guardian` | v1 earn vaults | `governance.guardian` | exact address |
| `feeReceiver` | v1 earn vaults | `governance.feeReceiver` | exact address |
| `timelock` | v1 earn vaults | `governance.timelock` | numeric |
| `strategies[*].strategy` | v1 earn vaults | `strategies[*].address` | exact address |
| `strategies[*].allocatedAssets` | v1 earn vaults | `strategies[*].allocatedAssets` | bigint |
| `strategies[*].currentAllocationCap` | v1 earn vaults | `strategies[*].allocationCap.current` | bigint |
| `strategies[*].pendingAllocationCap` | v1 earn vaults | `strategies[*].allocationCap.pending` | bigint |
| `strategies[*].removableAt` | v1 earn vaults | `strategies[*].removableAt` | numeric |
| `apyCurrent` / `supplyApy.baseApy` | v1 earn vaults | `EulerEarn.supplyApy * 100` | SDK currently not app-parity |
| `supplyApy.rewardApy` | v1 earn vaults | `rewards.totalRewardsApr * 100` | app reports percent |
| `intrinsicApy.apy` | v1 earn vaults | `intrinsicApy.apy` | compared directly |

## Coverage summary

### Classic / EVault

| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 765 | 0 | 508 |
| BNB Chain | 56 | 67 | 67 | 0 |
| Unichain | 130 | 50 | 50 | 0 |
| Monad | 143 | 77 | 0 | 33 |
| Sonic | 146 | 174 | 0 | 161 |
| TAC | 239 | 36 | 36 | 0 |
| Swell | 1923 | 22 | 22 | 0 |
| Base | 8453 | 242 | 0 | 189 |
| Plasma | 9745 | 156 | 156 | 0 |
| Arbitrum | 42161 | 113 | 113 | 0 |
| Avalanche | 43114 | 243 | 243 | 0 |
| Linea | 59144 | 86 | 86 | 0 |
| BOB | 60808 | 27 | 27 | 0 |
| Berachain | 80094 | 59 | 59 | 0 |

Classic totals:

- App-visible classic vaults: `2117`
- Missing in SDK `fetchAllVaults`: `859`
- Address matches with >1% field diffs: `891`

### Earn

| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 29 | 0 | 29 |
| BNB Chain | 56 | 3 | 3 | 0 |
| Unichain | 130 | 1 | 1 | 0 |
| Monad | 143 | 6 | 0 | 6 |
| Sonic | 146 | 2 | 0 | 2 |
| Swell | 1923 | 1 | 1 | 0 |
| Base | 8453 | 14 | 8 | 6 |
| Plasma | 9745 | 19 | 19 | 0 |
| Arbitrum | 42161 | 11 | 11 | 0 |
| Avalanche | 43114 | 13 | 13 | 0 |
| Linea | 59144 | 12 | 12 | 0 |

Earn totals:

- App-visible earn vaults: `111`
- Missing in SDK `fetchAllVaults`: `68`
- Address matches with >1% field diffs: `43`

## Discrepancies

### 1. SDK `fetchAllVaults` does not cover all app-visible chains

Classic vaults are entirely missing from SDK discovery on:

- BNB Chain (`56`): `67`
- Unichain (`130`): `50`
- TAC (`239`): `36`
- Swell (`1923`): `22`
- Plasma (`9745`): `156`
- Arbitrum (`42161`): `113`
- Avalanche (`43114`): `243`
- Linea (`59144`): `86`
- BOB (`60808`): `27`
- Berachain (`80094`): `59`

Earn vaults are entirely or partially missing on:

- BNB Chain (`56`): `3`
- Unichain (`130`): `1`
- Swell (`1923`): `1`
- Base (`8453`): `8`
- Plasma (`9745`): `19`
- Arbitrum (`42161`): `11`
- Avalanche (`43114`): `13`
- Linea (`59144`): `12`

This is the highest-priority gap because the app exposes these vaults but SDK discovery does not.

### 2. Classic cap semantics do not match the app

Most classic cap mismatches are uncapped markets represented differently:

- App: `null`
- SDK: `maxUint256` or sometimes `0`

Counts:

- `borrowCap`: `794`
- `supplyCap`: `668`

Examples:

- `0xe01354f8A8fa44E87d96574D1E5Bcd78D61d6EbE` on Ethereum
- `0xCc30FAE1Aa6050E142aa2810fbaD1f7a4507Bc3c` on Sonic

### 3. Classic intrinsic APY is not app-parity

Classic intrinsic APY mismatches: `138`

Observed patterns:

- App has a value and SDK has `null`
- App and SDK both have values but differ materially

Representative examples:

- `0xe01354f8A8fa44E87d96574D1E5Bcd78D61d6EbE`: app `1831.31`, SDK `null`
- `0xB6c9363DB7D651106Da38C68F34253688Fa25cda`: app `10.3131`, SDK `9.4570`
- `0x89963076d2aBCf6b3C449A8f0f69439C47C0464d`: app `9.0988`, SDK `7.9850`

Root cause is likely source mismatch: the SDK uses DefiLlama/Pendle/Stablewatch aggregation, while the app uses its own indexed intrinsic APY surface.

### 4. Classic totals, cash/borrow split, and APYs diverge on covered chains

This is most visible on Sonic and Base, with some smaller drifts on Ethereum.

Representative examples:

- Sonic `0x196F3C7443E940911EE2Bb88e019Fd71400349D9`
  - app `totalBorrowed=4,436,058.700558`, SDK `0`
  - app `totalCash=0`, SDK `4,470,343.441026`
  - app utilization `1`, SDK `0`
  - app supply/borrow APY near `85%/100%`, SDK `0/0`
- Sonic `0xB38D431e932fEa77d1dF0AE0dFE4400c97e597B8`
  - same cash/borrow inversion pattern
- Base `0x692b9F0C2701699b7a352C9331DFAE6A6a163294`
  - app `totalBorrowed=7285.537001`, SDK `0`
  - app `totalCash=0.120017`, SDK `7304.659578`
  - app utilization almost `100%`, SDK `0`

There are also smaller but still >1% drifts on otherwise normal vaults, for example:

- Ethereum `0x9851057442a55e349977b0CE644E19C05308F488`
- Ethereum `0x1F46186AF85A967416b17380800c69860B7C516F`

### 5. Classic token metadata differs from the app in a few cases

Counts:

- `assetSymbol`: `25`
- `assetDecimals`: `2`

Examples:

- `WOETH` vs `wOETH`
- `USD0++` vs `bUSD0`
- App `USDC.e` vs SDK `USDC` on Sonic
- Two vaults where app reports `18` decimals and SDK reports `6`

### 6. Earn governance, strategy state, and APY are not app-parity

Every covered earn vault had at least one discrepancy.

High-frequency fields:

- `apyCurrent`: `43`
- `supplyApy.base`: `43`
- `performanceFee`: `35`
- `guardian`: `43`
- `creator`: `11`
- `curator`: `4`
- `feeReceiver`: `4`

Strategy-level issues are severe:

- wrong strategy counts
- negative `allocatedAssets`
- `currentAllocationCap`/`pendingAllocationCap` collapsed to `0`
- `pendingRemoval` shown as `active`
- `removableAt` lost

Representative examples:

- Ethereum `0x49C5733d71511A78a3E12925ea832f49031c97e9`
  - app `apyCurrent=0.17546`, SDK `21332.9807`
  - app `strategies.count=14`, SDK `21`
  - multiple inactive/pending-removal strategies are marked active in SDK
  - multiple strategy allocations become negative
- Ethereum `0xA5cbf5cd429af63EA9989aE1ff4C9d37acFa6767`
  - app creator/fee receiver populated, SDK zeros them out
  - strategy allocations/caps are badly parsed
- Ethereum `0x59E03c1Db4F35BFfbA06B0451e199b17eFBC4A86`
  - app `totalAssets=10.949208`, SDK `3275.745752`
  - app `availableAssets=10.949207`, SDK `0`

### 7. Earn naming and deprecation metadata differ in a few cases

Examples:

- `0xA5cbf5cd429af63EA9989aE1ff4C9d37acFa6767`: app `TelosC Surge WBTC`, SDK `TelosC Earn WBTC`
- `0x49C5733d71511A78a3E12925ea832f49031c97e9`: app `TelosC Surge USDC`, SDK `Earn USDC`
- `0x743a7Bf04a295F80324da6468E97C407Ac4De2e9`: app shows `deprecated`, SDK still exposes `Euler Earn USDC / eeUSDC`

## SDK fix plan

Treating the app as the correct output, the SDK fix order should be:

### 1. Fix discovery parity first

Files:

- `packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.ts`
- `packages/euler-v2-sdk/src/services/vaults/eulerEarnService/adapters/eulerEarnV3Adapter.ts`

Work:

- Stop relying on `/v3/evk/vaults` and `/v3/earn/vaults` as the only discovery source for `fetchAllVaults`.
- Add a production fallback or replacement discovery source that covers every app-visible chain.
- Candidate parity source:
  - classic: indexer `v2/vault/list`
  - earn: indexer `v1/earn/vaults`
- Keep V3 detail hydration if it remains useful, but do not let missing V3 list coverage hide app-visible vaults.
- Add chain-coverage regression checks so `fetchAllVaults` fails loudly when app-supported chains drop out.

### 2. Normalize classic cap semantics to app behavior

Files:

- `packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterConversions.ts`

Work:

- Map uncapped values consistently:
  - app `null`
  - SDK currently `maxUint256` or `0`
- Decide whether SDK should expose raw caps and app-normalized caps separately, or normalize the entity itself.
- Add tests covering `null`, `0`, and `maxUint256` cap cases.

### 3. Audit classic V3 detail field mapping on covered chains

Files:

- `packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterConversions.ts`

Hot spots:

- `totalCash` / `totalBorrowed` mapping around lines `696-707`
- interest rate mapping around lines `600-623`

Work:

- Reproduce the Sonic/Base vaults where app shows nearly full utilization but SDK shows `borrowed=0` and `cash=totalAssets`.
- Verify the V3 payload semantics against the app’s `GetVaultData` semantics.
- If V3 is returning a different state model, add translation logic or pull these fields from the same indexed surface the app uses.

### 4. Use app-parity metadata and price surfaces for classic vaults

Files:

- `packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3AdapterConversions.ts`
- `packages/euler-v2-sdk/src/services/priceService/*`
- `packages/euler-v2-sdk/src/services/eulerLabelsService/*`

Work:

- Resolve token symbol/decimals parity for cases like `USDC.e`, `USD0++`, and `WOETH`.
- Prefer the same asset metadata source used by the app for display parity.
- Keep USD valuation math aligned with the app’s price source after metadata normalization.

### 5. Replace intrinsic APY parity logic

Files:

- `packages/euler-v2-sdk/src/services/intrinsicApyService/intrinsicApyService.ts`

Current behavior:

- SDK aggregates DefiLlama, Pendle, and Stablewatch

App behavior:

- app uses indexed intrinsic APY outputs

Work:

- Add an app/indexer-backed intrinsic APY adapter and make it the default parity path.
- Keep the current third-party aggregator only as an explicit alternate mode if needed.

### 6. Fix EulerEarn V3 conversion before touching derived APY

Files:

- `packages/euler-v2-sdk/src/services/vaults/eulerEarnService/adapters/eulerEarnV3Adapter.ts`

Hot spots:

- governance mapping: lines `130-175`
- strategy mapping: lines `200-263`
- `performanceFee`: lines `304-306`

Work:

- Fix governance address sourcing so creator/curator/guardian/feeReceiver match the app.
- Fix performance-fee parsing and scaling.
- Fix strategy allocation/cap parsing; negative values strongly suggest a decode/field-selection bug.
- Preserve strategy status and pending-removal semantics instead of inferring only from `removableAt`.
- Align strategy counts with the app’s filtered active/inactive strategy set.

### 7. Rework `EulerEarn.supplyApy` to match app semantics

Files:

- `packages/euler-v2-sdk/src/entities/EulerEarn.ts`

Current behavior:

- weighted average of resolved strategy `supplyAPY`
- multiplied by `(1 - performanceFee)`

Observed result:

- app-parity failure on every covered earn vault

Work:

- Do not treat the current derived formula as app-equivalent.
- Either:
  - fetch and store the app/indexer earn APY directly, or
  - replicate the exact app/indexer formula if it is available in backend code/spec.
- Only after strategy parsing is fixed, validate whether a derived formula is still needed.

### 8. Add a parity regression harness

Recommended test shape:

- fixture-based comparison against saved app responses for representative vaults across:
  - Ethereum
  - Base
  - Sonic
  - one unsupported discovery chain
  - one earn vault with pending-removal strategies
- assertion buckets:
  - discovery coverage
  - governance fields
  - caps semantics
  - totals/cash/borrow/utilization
  - APYs
  - strategy allocations/statuses

## Priority order

1. discovery coverage for all app-visible chains
2. earn strategy/governance parsing
3. classic cash/borrow/utilization parity on covered chains
4. intrinsic APY parity
5. metadata and cap normalization

## Notes

- This comparison intentionally treated the app as correct even where the SDK may currently be exposing lower-level/raw values.
- Managed vault pages were not part of this pass; this file covers classic/eVault and earn vaults only.
