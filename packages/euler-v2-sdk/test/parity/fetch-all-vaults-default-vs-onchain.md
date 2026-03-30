# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-03-30T14:38:04.360Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `797`
- Onchain vaults: `795`
- Matched vaults: `557`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `238`
- Default errors: `442`
- Onchain errors: `247`

## Top diff paths

- `$.fees.accumulatedFeesAssets`: `41`
- `$.fees.accumulatedFeesShares`: `41`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk`: `38`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutBid`: `38`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutMid`: `38`
- `$.collaterals[1].vault.collaterals[0].oraclePriceRaw.amountOutAsk`: `38`
- `$.collaterals[1].vault.collaterals[0].oraclePriceRaw.amountOutBid`: `38`
- `$.collaterals[1].vault.collaterals[0].oraclePriceRaw.amountOutMid`: `38`
- `$.collaterals[0].vault.oraclePriceRaw.amountOutAsk`: `35`
- `$.collaterals[0].vault.oraclePriceRaw.amountOutBid`: `35`

## Chain 1

- Default (V3) vaults: `797`
- Onchain vaults: `795`
- Matched vaults: `557`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `238`
- Default errors: `442`
- Onchain errors: `247`

Top diff paths:

- `$.fees.accumulatedFeesAssets`: `41`
- `$.fees.accumulatedFeesShares`: `41`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk`: `38`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutBid`: `38`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutMid`: `38`
- `$.collaterals[1].vault.collaterals[0].oraclePriceRaw.amountOutAsk`: `38`
- `$.collaterals[1].vault.collaterals[0].oraclePriceRaw.amountOutBid`: `38`
- `$.collaterals[1].vault.collaterals[0].oraclePriceRaw.amountOutMid`: `38`
- `$.collaterals[0].vault.oraclePriceRaw.amountOutAsk`: `35`
- `$.collaterals[0].vault.oraclePriceRaw.amountOutBid`: `35`

Representative diff vaults:

- root `0x000997971B3C0D4d87a3Db59aA350f298a4e1730` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67853702537450000000000"}` vs onchain `{"__type":"bigint","value":"67141390000000000000000"}`
- root `0x0087d6b548A98D8ADF93c9E1f9C0650c034B2C7f` (EVault): `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"66613000000000000000000"}` vs onchain `{"__type":"bigint","value":"67744850000000000000000"}`
- root `0x038dd0Eb275B7DE3B07884f1Fa106eD6423C45F2` (EVault); issue vault `0xbBc4BC013F1C9Ed674098A6d156C02C0a21a285C`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"70455439214252010758332"}` vs onchain `{"__type":"bigint","value":"69715814244543701490000"}`
- root `0x056f3a2E41d2778D3a0c0714439c53af2987718E` (EVault): `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"68323082560363886498500"}` vs onchain `{"__type":"bigint","value":"67605853993603000000000"}`
- root `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000f1ec0000000000000000000000000000000000000000000000000000000000001c20"` vs onchain `"0xa6e68d6300000000000000000000000000000000000000000000000000000000000109440000000000000000000000000000000000000000000000000000000000001c20"`
- root `0x09136DAC538B54994170a6905507a74562A80ed3` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[1].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"68323082560363886498500"}` vs onchain `{"__type":"bigint","value":"67605853993603000000000"}`
- root `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069ca71530000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069ca8abb0000000000000000000000000000000000000000000000000000000000000078"`
- root `0x09FcE883cC16894274802c01e3b9cD90EAE4e43d` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"68323082560363886498500"}` vs onchain `{"__type":"bigint","value":"67605853993603000000000"}`
- root `0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2044905030030000000000"}`
- root `0x122e9eA082D8c060Bb1a3476aa18B9E739fBbAAf` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[1].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"68323082560363886498500"}` vs onchain `{"__type":"bigint","value":"67605853993603000000000"}`
- root `0x14d777665EA3bb224f222E69c85bcA890557d078` (EVault); issue vault `0x43BC56b2E10AcAd2b0dc021F1C9866DB259CEb5B`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67853702537450000000000"}` vs onchain `{"__type":"bigint","value":"67141390000000000000000"}`
- root `0x15A60a5300c1D9179d4c0e2B49bac6146794Ae1F` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"68323082560363886498500"}` vs onchain `{"__type":"bigint","value":"67605853993603000000000"}`
- root `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"68323082560363886498500"}` vs onchain `{"__type":"bigint","value":"67605853993603000000000"}`
- root `0x1987c2DCf5674Cf90bEceBAd502714c357ce126a` (EVault); issue vault `0x25C538cc5c5B4cDdf9a9A656f90d2d8129E841B2`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"8893870000000000000"}` vs onchain `{"__type":"bigint","value":"8777000000000000000"}`
- root `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5` (EVault); issue vault `0xc364FD9637fe562A2d5a1cbc7d1Ab7F32bE900ef`: `$.collaterals[0].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c224840000000000000000000000000000000000000000000000000000000000015180"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c23ac80000000000000000000000000000000000000000000000000000000000015180"`
- root `0x1B4715a2Ef8fecA45ACC2D19F780a33F34F498a0` (EulerEarn); issue vault `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`: `$.asset.name` value mismatch; default `"Unknown Asset"` vs onchain `""`
- root `0x1Cd028b971eBC0bf8a2c4fBf440112cAAf8cb6d5` (EVault); issue vault `0x000997971B3C0D4d87a3Db59aA350f298a4e1730`: `$.collaterals[0].vault.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67853702537450000000000"}` vs onchain `{"__type":"bigint","value":"67141390000000000000000"}`
- root `0x1E053f8dc25AdDA8116473fA64958cda5d937CE9` (EVault): `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2073110089830000000000"}` vs onchain `{"__type":"bigint","value":"2045252410000000000000"}`
- root `0x20622fcD4476fbc9d5Ef36EBd371307a56d9028c` (EVault); issue vault `0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6`: `$.collaterals[1].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"3533543756179013934"}` vs onchain `{"__type":"bigint","value":"3616686084423220529"}`
- root `0x21d3CeeAcced883d72f02f7D04Fb45218cAF8E27` (EulerEarn); issue vault `0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb`: `$.asset.name` value mismatch; default `"Unknown Asset"` vs onchain `""`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x7065662E9C0410c6DDc3da66a878070c724D44D4` (EVault)
- `0xADc94A81934Fd5382B21daf0850B835e8415104C` (EVault)

