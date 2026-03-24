# SDK vs App Vault Cross-Reference (Onchain Adapters)

Generated on 2026-03-24 using:

- saved script: `packages/euler-v2-sdk/scripts/compare-sdk-app-vaults.mts`
- mode: `ADAPTER_MODE=onchain`
- app truth:
  - `POST https://indexer.euler.finance/v2/vault/list`
  - `GET https://app.euler.finance/api/v1/vault`
  - `GET https://indexer.euler.finance/v1/earn/vaults`

The same 1% numerical tolerance from the earlier V3 pass was used here.

## Coverage summary

### Classic / EVault

| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 765 | 2 | 507 |
| Unichain | 130 | 50 | 0 | 34 |
| Monad | 143 | 77 | 0 | 34 |
| Sonic | 146 | 174 | 15 | 148 |
| TAC | 239 | 36 | 0 | 15 |
| Swell | 1923 | 22 | 0 | 15 |
| Base | 8453 | 242 | 12 | 177 |
| Plasma | 9745 | 156 | 118 | 28 |
| Arbitrum | 42161 | 113 | 0 | 84 |
| Avalanche | 43114 | 243 | 3 | 198 |
| Linea | 59144 | 86 | 0 | 46 |
| BOB | 60808 | 27 | 0 | 24 |
| Berachain | 80094 | 59 | 1 | 30 |

Classic totals:

- App-visible classic vaults covered in this onchain pass: `2050`
- Missing in SDK onchain `fetchAllVaults`: `151`
- Address matches with >1% field diffs: `1340`

### Earn

| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 29 | 0 | 29 |
| BNB Chain | 56 | 3 | 0 | 3 |
| Monad | 143 | 6 | 0 | 6 |
| Sonic | 146 | 2 | 0 | 2 |
| Swell | 1923 | 1 | 0 | 1 |
| Base | 8453 | 14 | 0 | 14 |
| Plasma | 9745 | 19 | 0 | 19 |
| Arbitrum | 42161 | 11 | 0 | 11 |
| Avalanche | 43114 | 13 | 0 | 13 |
| Linea | 59144 | 12 | 0 | 12 |

Earn totals:

- App-visible earn vaults covered in this onchain pass: `110`
- Missing in SDK onchain `fetchAllVaults`: `0`
- Address matches with >1% field diffs: `110`

## Main findings

### 1. Onchain discovery is much better than V3, but still not complete for classic vaults

The onchain adapters closed most of the chain-coverage gaps from the V3 pass, but classic discovery still misses:

- Plasma (`9745`): `118`
- Sonic (`146`): `15`
- Base (`8453`): `12`
- Avalanche (`43114`): `3`
- Ethereum (`1`): `2`
- Berachain (`80094`): `1`

Representative missing classic vaults:

- Ethereum: `0xADc94A81934Fd5382B21daf0850B835e8415104C`
- Ethereum: `0x7065662E9C0410c6DDc3da66a878070c724D44D4`
- Sonic: `0x196F3C7443E940911EE2Bb88e019Fd71400349D9`
- Base: `0x692b9F0C2701699b7a352C9331DFAE6A6a163294`
- Plasma: `0x4718484ac9dc07fbbC078561e8f8Ef29e2a369CD`

### 2. Earn discovery is complete on the chains exercised by the onchain adapters

This is the biggest improvement over the V3 run:

- earn `missingInSdk` dropped from `68` to `0`

The remaining problem is not discovery, but parity of values and status fields.

### 3. Classic cap semantics are still the noisiest mismatch

Counts:

- `borrowCap`: `1168`
- `supplyCap`: `997`

Same pattern as the V3 run:

- app uses `null` for uncapped
- SDK exposes raw onchain sentinel values like `maxUint256`

Examples:

- `0xe01354f8A8fa44E87d96574D1E5Bcd78D61d6EbE`
- `0x9851057442a55e349977b0CE644E19C05308F488`

### 4. Classic intrinsic APY parity is still poor

Count: `253`

Examples:

- `0xe01354f8A8fa44E87d96574D1E5Bcd78D61d6EbE`: app `1831.31`, SDK `null`
- `0xa3e0943d0196F76db58d3549C9a7528Ef4ac335F`: app `10.3131`, SDK `9.4570`
- `0x49d9fd20f1d61648Fa9434a8c0C33174F5614eB8`: app `9.19`, SDK `null`

This confirms the issue is not specific to the V3 adapters; it is in the SDK intrinsic APY sourcing itself.

### 5. Classic totals are closer than V3 on covered vaults, but still not app-parity

Counts:

- `totalAssets`: `19`
- `totalBorrowed`: `22`
- `totalAssetsUsd`: `137`
- `cashUsd`: `121`

Representative examples:

- `0x9851057442a55e349977b0CE644E19C05308F488`
  - app total assets `10.659939`
  - SDK `11.450445`
- `0x1F46186AF85A967416b17380800c69860B7C516F`
  - app total assets `2,874,126.9683`
  - SDK `2,998,351.5093`

The large Sonic/Base cash-vs-borrow inversion cases from the V3 run mostly moved into `missing_in_sdk` on the onchain pass, which suggests those problem vaults are failing discovery/read parity rather than just conversion.

### 6. Earn parity is still poor even with onchain adapters

Counts:

- `performanceFee`: `83`
- `guardian`: `110`
- `apyCurrent`: `96`
- `supplyApy.base`: `96`

Representative examples:

- `0x49C5733d71511A78a3E12925ea832f49031c97e9`
  - guardian differs
  - multiple strategies marked `active` in SDK while app says `inactive` or `pendingRemoval`
- `0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245`
  - app APY `3.2832`, SDK `3.3966`
- `0x59E03c1Db4F35BFfbA06B0451e199b17eFBC4A86`
  - app APY `3.0130`, SDK `3.2376`
  - allocated assets drift on at least one strategy

### 7. Earn strategy status parity is still broken

The severe negative-allocation issue from the V3 run largely disappeared on the onchain pass, but status parity is still wrong:

- app `inactive` -> SDK `active`
- app `pendingRemoval` -> SDK `active`

Examples:

- `0x49C5733d71511A78a3E12925ea832f49031c97e9`
- `0x9B5aac9c6C70d5a583f44DDd13DF25AcC431fca4`
- `0x3cd3718f8f047aA32F775E2cb4245A164E1C99fB`

## Comparison to the V3 run

What improved with onchain adapters:

- classic missing vaults: `859 -> 151`
- earn missing vaults: `68 -> 0`
- earn negative strategy allocations mostly disappeared
- classic totals/cash/borrow parity improved for many covered vaults

What did not improve:

- cap normalization
- intrinsic APY parity
- earn governance parity, especially `guardian`
- earn APY parity
- earn strategy status semantics

## Updated fix priorities

1. Keep the saved comparison script and use it as the parity harness.
2. For classic discovery, prefer whichever source gives app-complete coverage:
   - onchain is much better than V3
   - but Plasma/Sonic/Base still need fallback coverage
3. Normalize classic cap semantics in the entity layer or provide app-normalized accessors.
4. Replace intrinsic APY sourcing with the app/indexer-backed source.
5. Fix earn governance/status parity even on the onchain path:
   - `guardian`
   - `performanceFee`
   - strategy `inactive` / `pendingRemoval`
6. Rework `EulerEarn.supplyApy` to match the app/indexer semantics instead of relying on the current derived formula.

## Saved script

Reusable script path:

- `packages/euler-v2-sdk/scripts/compare-sdk-app-vaults.mts`

Example invocations:

```bash
pnpm exec tsx scripts/compare-sdk-app-vaults.mts > /tmp/sdk-app-vault-compare-v3.json
ADAPTER_MODE=onchain pnpm exec tsx scripts/compare-sdk-app-vaults.mts > /tmp/sdk-app-vault-compare-onchain.json
```
