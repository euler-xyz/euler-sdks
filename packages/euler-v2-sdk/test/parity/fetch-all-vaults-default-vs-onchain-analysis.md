# Default vs Onchain Parity Cluster Analysis

Generated from fetch-all-vaults-default-vs-onchain.json at 2026-03-30T10:30:27.044Z.

## Summary

- Default (V3) vaults: 797
- Onchain vaults: 795
- Matched vaults: 556
- Vaults with diffs: 239
- Missing in default: 0
- Missing in onchain: 2
- Default errors: 369
- Onchain errors: 248

## Cluster Ranking

- oracleAdapters: 1067 issues across 105 vaults
- interestRates.supplyAPY: 688 issues across 159 vaults
- oraclePriceRaw: 483 issues across 30 vaults
- oraclePriceRaw.queryFailureReason: 145 issues across 40 vaults
- strategies: 88 issues across 5 vaults
- timestamp: 8 issues across 8 vaults
- collaterals: 7 issues across 4 vaults
- asset: 7 issues across 5 vaults
- supplyApy1h: 7 issues across 7 vaults
- fees: 6 issues across 3 vaults
- shares: 6 issues across 5 vaults
- totalAssets: 3 issues across 3 vaults
- debtPricingOracleAdapters: 3 issues across 3 vaults
- unitOfAccount: 2 issues across 1 vaults
- unitOfAccount.decimals: 1 issues across 1 vaults

## Cluster Details

### oracleAdapters

- Issue count: 1067
- Affected vaults: 105
- Reasons: `value mismatch`: 930, `missing on onchain`: 79, `missing on default`: 40, `array length mismatch`: 18
- Note: Still the largest remaining gap, but much smaller now. What remains looks like real source-content differences for a subset of nested oracle graphs rather than broad ordering noise.
- Top paths:
  - `$.collaterals[0].oracleAdapters[0]`: 50
  - `$.collaterals[1].oracleAdapters[0]`: 35
  - `$.collaterals[2].oracleAdapters[0]`: 30
  - `$.collaterals[1].oracleAdapters[1].base`: 24
  - `$.collaterals[1].oracleAdapters[1].chainlinkDetail`: 22
  - `$.collaterals[1].oracleAdapters[1].name`: 22
  - `$.collaterals[1].oracleAdapters[1].oracle`: 22
  - `$.collaterals[9].oracleAdapters[0]`: 21
- Sample diffs:
  - 0x01864aE3c7d5f507cC4c24cA67B4CABbDdA37EcD (EVault): `$.collaterals[0].vault.oracle.adapters` array length mismatch; default `1` vs onchain `0`
  - 0x01864aE3c7d5f507cC4c24cA67B4CABbDdA37EcD (EVault): `$.collaterals[0].vault.oracle.adapters[0]` missing on onchain; default `{"base":"0xBA1EDF4A4C7eB8Cb0DaE0594326179f9c7D909D2","name":"PendleUniversalOracle","oracle":"0xD7353ed4d823094f9846f68457dbFE7dDb363eb1","quote":"0x0000000000000000000000000000000000000348"}` vs onchain `{"__type":"undefined"}`
  - 0x056f3a2E41d2778D3a0c0714439c53af2987718E (EVault): `$.collaterals[0].oracleAdapters[0]` value mismatch; default `{"base":"0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7","name":"RateProviderOracle","oracle":"0x013F30a593718D962c0CeeDe0a66f5f9EF5451b5","quote":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"}` vs onchain `"[circular]"`

### interestRates.supplyAPY

- Issue count: 688
- Affected vaults: 159
- Reasons: `value mismatch`: 688
- Note: Now mostly small decimal-string drift between V3 and onchain EVault APY values.
- Top paths:
  - `$.interestRates.supplyAPY`: 80
  - `$.collaterals[0].vault.interestRates.supplyAPY`: 61
  - `$.collaterals[1].vault.interestRates.supplyAPY`: 56
  - `$.collaterals[2].vault.interestRates.supplyAPY`: 42
  - `$.collaterals[3].vault.interestRates.supplyAPY`: 42
  - `$.collaterals[4].vault.interestRates.supplyAPY`: 30
  - `$.collaterals[9].vault.interestRates.supplyAPY`: 15
  - `$.collaterals[6].vault.interestRates.supplyAPY`: 15
- Sample diffs:
  - 0x01864aE3c7d5f507cC4c24cA67B4CABbDdA37EcD (EVault): `$.interestRates.supplyAPY` value mismatch; default `"0.001755997591343058404303184"` vs onchain `"0.00175599759134305840430801"`
  - 0x038dd0Eb275B7DE3B07884f1Fa106eD6423C45F2 (EVault): `$.interestRates.supplyAPY` value mismatch; default `"0.001755997591095950771393889"` vs onchain `"0.001755997591095950781174905"`
  - 0x056f3a2E41d2778D3a0c0714439c53af2987718E (EVault): `$.collaterals[0].vault.interestRates.supplyAPY` value mismatch; default `"0.000000475280531205820300551"` vs onchain `"0.000000475280534097315791849"`

### oraclePriceRaw

- Issue count: 483
- Affected vaults: 30
- Reasons: `bigint values differ by more than 1%`: 360, `value mismatch`: 120, `missing on default`: 3
- Note: Concentrated pricing mismatches remain; several rows are real 0-vs-nonzero oracle outputs.
- Top paths:
  - `$.collaterals[3].vault.collaterals[0].oraclePriceRaw.amountOutAsk`: 6
  - `$.collaterals[3].vault.collaterals[0].oraclePriceRaw.amountOutBid`: 6
  - `$.collaterals[3].vault.collaterals[0].oraclePriceRaw.amountOutMid`: 6
  - `$.collaterals[3].vault.collaterals[0].oraclePriceRaw.queryFailure`: 6
  - `$.collaterals[3].vault.collaterals[1].oraclePriceRaw.amountOutAsk`: 6
  - `$.collaterals[3].vault.collaterals[1].oraclePriceRaw.amountOutBid`: 6
  - `$.collaterals[3].vault.collaterals[1].oraclePriceRaw.amountOutMid`: 6
  - `$.collaterals[3].vault.collaterals[1].oraclePriceRaw.queryFailure`: 6
- Sample diffs:
  - 0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb (EVault): `$.collaterals[2].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"999754460000000000"}` vs onchain `{"__type":"bigint","value":"0"}`
  - 0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb (EVault): `$.collaterals[2].vault.collaterals[0].oraclePriceRaw.amountOutBid` bigint values differ by more than 1%; default `{"__type":"bigint","value":"999754460000000000"}` vs onchain `{"__type":"bigint","value":"0"}`
  - 0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb (EVault): `$.collaterals[2].vault.collaterals[0].oraclePriceRaw.amountOutMid` bigint values differ by more than 1%; default `{"__type":"bigint","value":"999754460000000000"}` vs onchain `{"__type":"bigint","value":"0"}`

### oraclePriceRaw.queryFailureReason

- Issue count: 145
- Affected vaults: 40
- Reasons: `value mismatch`: 145
- Note: Diagnostic revert payload drift only.
- Top paths:
  - `$.collaterals[0].oraclePriceRaw.queryFailureReason`: 13
  - `$.oraclePriceRaw.queryFailureReason`: 11
  - `$.collaterals[0].vault.oraclePriceRaw.queryFailureReason`: 7
  - `$.collaterals[1].oraclePriceRaw.queryFailureReason`: 7
  - `$.collaterals[3].vault.collaterals[0].oraclePriceRaw.queryFailureReason`: 6
  - `$.collaterals[3].vault.collaterals[1].oraclePriceRaw.queryFailureReason`: 6
  - `$.collaterals[3].vault.collaterals[4].oraclePriceRaw.queryFailureReason`: 6
  - `$.collaterals[2].vault.collaterals[0].oraclePriceRaw.queryFailureReason`: 5
- Sample diffs:
  - 0x0685191dFd11E09fD23C01C54d32b84c4D18ed77 (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000cccc0000000000000000000000000000000000000000000000000000000000001c20"` vs onchain `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000cf3c0000000000000000000000000000000000000000000000000000000000001c20"`
  - 0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069ca3f970000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069ca50b30000000000000000000000000000000000000000000000000000000000000078"`
  - 0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb (EVault): `$.collaterals[2].vault.collaterals[0].oraclePriceRaw.queryFailureReason` value mismatch; default `"0x"` vs onchain `"0xd743df6a"`

### strategies

- Issue count: 88
- Affected vaults: 5
- Reasons: `missing on default`: 78, `bigint values differ by more than 1%`: 4, `missing on onchain`: 3, `value mismatch`: 3
- Note: The bulk strategy-array mismatch is fixed. Remaining rows are a small number of real value differences.
- Top paths:
  - `$.strategies[3].vault.fees.accumulatedFeesAssets`: 1
  - `$.strategies[3].vault.fees.accumulatedFeesShares`: 1
  - `$.strategies[12].vault.__type`: 1
  - `$.strategies[12].vault.address`: 1
  - `$.strategies[12].vault.asset`: 1
  - `$.strategies[12].vault.balanceTracker`: 1
  - `$.strategies[12].vault.caps`: 1
  - `$.strategies[12].vault.chainId`: 1
- Sample diffs:
  - 0x32Cf8bd02A916c3cf1E4Ccb9c7A00D4a3f96BfDF (EulerEarn): `$.strategies[3].vault.fees.accumulatedFeesAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"3445241"}` vs onchain `{"__type":"bigint","value":"3497609"}`
  - 0x32Cf8bd02A916c3cf1E4Ccb9c7A00D4a3f96BfDF (EulerEarn): `$.strategies[3].vault.fees.accumulatedFeesShares` bigint values differ by more than 1%; default `{"__type":"bigint","value":"3332782"}` vs onchain `{"__type":"bigint","value":"3383435"}`
  - 0x49C5733d71511A78a3E12925ea832f49031c97e9 (EulerEarn): `$.strategies[12].vault.__type` missing on onchain; default `"undefined"` vs onchain `{"__type":"undefined"}`

### timestamp

- Issue count: 8
- Affected vaults: 8
- Reasons: `numeric values differ by more than 1%`: 8
- Note: Default EulerEarn timestamp is still missing for a small set of vaults.
- Top paths:
  - `$.timestamp`: 8
- Sample diffs:
  - 0x1B4715a2Ef8fecA45ACC2D19F780a33F34F498a0 (EulerEarn): `$.timestamp` numeric values differ by more than 1%; default `0` vs onchain `1774866611`
  - 0x21d3CeeAcced883d72f02f7D04Fb45218cAF8E27 (EulerEarn): `$.timestamp` numeric values differ by more than 1%; default `0` vs onchain `1774866611`
  - 0x743a7Bf04a295F80324da6468E97C407Ac4De2e9 (EulerEarn): `$.timestamp` numeric values differ by more than 1%; default `0` vs onchain `1774866611`

### collaterals

- Issue count: 7
- Affected vaults: 4
- Reasons: `bigint values differ by more than 1%`: 6, `numeric values differ by more than 1%`: 1
- Top paths:
  - `$.collaterals[0].vault.fees.accumulatedFeesAssets`: 1
  - `$.collaterals[0].vault.fees.accumulatedFeesShares`: 1
  - `$.collaterals[5].vault.fees.accumulatedFeesAssets`: 1
  - `$.collaterals[5].vault.fees.accumulatedFeesShares`: 1
  - `$.collaterals[3].vault.fees.accumulatedFeesAssets`: 1
  - `$.collaterals[3].vault.fees.accumulatedFeesShares`: 1
  - `$.collaterals[0].vault.supplyApy1h`: 1
- Sample diffs:
  - 0x122e9eA082D8c060Bb1a3476aa18B9E739fBbAAf (EVault): `$.collaterals[0].vault.fees.accumulatedFeesAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"6"}` vs onchain `{"__type":"bigint","value":"7"}`
  - 0x122e9eA082D8c060Bb1a3476aa18B9E739fBbAAf (EVault): `$.collaterals[0].vault.fees.accumulatedFeesShares` bigint values differ by more than 1%; default `{"__type":"bigint","value":"6"}` vs onchain `{"__type":"bigint","value":"7"}`
  - 0x3573A84Bee11D49A1CbCe2b291538dE7a7dD81c6 (EVault): `$.collaterals[5].vault.fees.accumulatedFeesAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"84"}` vs onchain `{"__type":"bigint","value":"85"}`

### asset

- Issue count: 7
- Affected vaults: 5
- Reasons: `value mismatch`: 7
- Top paths:
  - `$.asset.name`: 5
  - `$.asset.symbol`: 2
- Sample diffs:
  - 0x1B4715a2Ef8fecA45ACC2D19F780a33F34F498a0 (EulerEarn): `$.asset.name` value mismatch; default `"Unknown Asset"` vs onchain `""`
  - 0x1B4715a2Ef8fecA45ACC2D19F780a33F34F498a0 (EulerEarn): `$.asset.symbol` value mismatch; default `"UNKNOWN"` vs onchain `""`
  - 0x21d3CeeAcced883d72f02f7D04Fb45218cAF8E27 (EulerEarn): `$.asset.name` value mismatch; default `"Unknown Asset"` vs onchain `""`

### supplyApy1h

- Issue count: 7
- Affected vaults: 7
- Reasons: `numeric values differ by more than 1%`: 7
- Note: The scale mismatch is fixed. Remaining rows are smaller real APY differences.
- Top paths:
  - `$.supplyApy1h`: 7
- Sample diffs:
  - 0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245 (EulerEarn): `$.supplyApy1h` numeric values differ by more than 1%; default `0.03575364206996201` vs onchain `0.035012433221133774`
  - 0x32Cf8bd02A916c3cf1E4Ccb9c7A00D4a3f96BfDF (EulerEarn): `$.supplyApy1h` numeric values differ by more than 1%; default `0.02209954368396083` vs onchain `0.01781715779721993`
  - 0x3B4802FDb0E5d74aA37d58FD77d63e93d4f9A4AF (EulerEarn): `$.supplyApy1h` numeric values differ by more than 1%; default `0.022436817714437174` vs onchain `0.022188705397703425`

### fees

- Issue count: 6
- Affected vaults: 3
- Reasons: `bigint values differ by more than 1%`: 6
- Top paths:
  - `$.fees.accumulatedFeesAssets`: 3
  - `$.fees.accumulatedFeesShares`: 3
- Sample diffs:
  - 0x09136DAC538B54994170a6905507a74562A80ed3 (EVault): `$.fees.accumulatedFeesAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"6"}` vs onchain `{"__type":"bigint","value":"7"}`
  - 0x09136DAC538B54994170a6905507a74562A80ed3 (EVault): `$.fees.accumulatedFeesShares` bigint values differ by more than 1%; default `{"__type":"bigint","value":"6"}` vs onchain `{"__type":"bigint","value":"7"}`
  - 0xbFdc482616787b420BC6C710212fE3167E7198e9 (EVault): `$.fees.accumulatedFeesAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"84"}` vs onchain `{"__type":"bigint","value":"85"}`

### shares

- Issue count: 6
- Affected vaults: 5
- Reasons: `value mismatch`: 6
- Top paths:
  - `$.shares.name`: 4
  - `$.shares.symbol`: 2
- Sample diffs:
  - 0x3cd3718f8f047aA32F775E2cb4245A164E1C99fB (EulerEarn): `$.shares.symbol` value mismatch; default `"hypeEulerUSDC"` vs onchain `"hyperEulerUSDC"`
  - 0x49C5733d71511A78a3E12925ea832f49031c97e9 (EulerEarn): `$.shares.name` value mismatch; default `"Earn USDC"` vs onchain `"TelosC Surge USDC"`
  - 0x743a7Bf04a295F80324da6468E97C407Ac4De2e9 (EulerEarn): `$.shares.name` value mismatch; default `"Euler Earn USDC"` vs onchain `"deprecated"`

### totalAssets

- Issue count: 3
- Affected vaults: 3
- Reasons: `bigint values differ by more than 1%`: 3
- Top paths:
  - `$.totalAssets`: 3
- Sample diffs:
  - 0x2f3558213c050731b3ae632811eFc1562d3F91CC (EulerEarn): `$.totalAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"100020851"}` vs onchain `{"__type":"bigint","value":"207"}`
  - 0x59E03c1Db4F35BFfbA06B0451e199b17eFBC4A86 (EulerEarn): `$.totalAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"3275745752"}` vs onchain `{"__type":"bigint","value":"11084676"}`
  - 0xE8FAb52ee6b9029615F6E86E31588BaD92BeFCd2 (EulerEarn): `$.totalAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"83366490367465879073"}` vs onchain `{"__type":"bigint","value":"20050944197086750017"}`

### debtPricingOracleAdapters

- Issue count: 3
- Affected vaults: 3
- Reasons: `missing on default`: 3
- Note: Most remaining debt-pricing diffs appear downstream of the remaining oracle adapter content mismatches.
- Top paths:
  - `$.strategies[12].vault.debtPricingOracleAdapters`: 1
  - `$.strategies[2].vault.debtPricingOracleAdapters`: 1
  - `$.strategies[1].vault.debtPricingOracleAdapters`: 1
- Sample diffs:
  - 0x49C5733d71511A78a3E12925ea832f49031c97e9 (EulerEarn): `$.strategies[12].vault.debtPricingOracleAdapters` missing on default; default `{"__type":"undefined"}` vs onchain `[]`
  - 0xA5cbf5cd429af63EA9989aE1ff4C9d37acFa6767 (EulerEarn): `$.strategies[2].vault.debtPricingOracleAdapters` missing on default; default `{"__type":"undefined"}` vs onchain `[]`
  - 0xd217A07493b6BA272Ff806EE5eaBdFF86C292cc6 (EulerEarn): `$.strategies[1].vault.debtPricingOracleAdapters` missing on default; default `{"__type":"undefined"}` vs onchain `[]`

### unitOfAccount

- Issue count: 2
- Affected vaults: 1
- Reasons: `value mismatch`: 2
- Top paths:
  - `$.unitOfAccount.name`: 1
  - `$.unitOfAccount.symbol`: 1
- Sample diffs:
  - 0xbd0ba0A3f3faC4Db58b11512b9c807746FdB2e6a (EVault): `$.unitOfAccount.name` value mismatch; default `"Bitcoin"` vs onchain `""`
  - 0xbd0ba0A3f3faC4Db58b11512b9c807746FdB2e6a (EVault): `$.unitOfAccount.symbol` value mismatch; default `"BTC"` vs onchain `""`

### unitOfAccount.decimals

- Issue count: 1
- Affected vaults: 1
- Reasons: `numeric values differ by more than 1%`: 1
- Note: Only a narrow subset remains after the V3 fallback normalization change.
- Top paths:
  - `$.unitOfAccount.decimals`: 1
- Sample diffs:
  - 0xbd0ba0A3f3faC4Db58b11512b9c807746FdB2e6a (EVault): `$.unitOfAccount.decimals` numeric values differ by more than 1%; default `8` vs onchain `18`

