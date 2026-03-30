# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-03-30T14:15:33.511Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `797`
- Onchain vaults: `795`
- Matched vaults: `698`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `97`
- Default errors: `374`
- Onchain errors: `248`

## Top diff paths

- `$.collaterals[5].vault.fees.accumulatedFeesAssets`: `12`
- `$.collaterals[5].vault.fees.accumulatedFeesShares`: `12`
- `$.collaterals[0].oraclePriceRaw.queryFailureReason`: `8`
- `$.oraclePriceRaw.queryFailureReason`: `8`
- `$.timestamp`: `8`
- `$.collaterals[0].vault.oraclePriceRaw.queryFailureReason`: `7`
- `$.oracle.adapters`: `7`
- `$.oracle.adapters[0]`: `7`
- `$.collaterals[0].vault.collaterals[2].oraclePriceRaw.amountOutAsk`: `6`
- `$.collaterals[0].vault.collaterals[2].oraclePriceRaw.amountOutBid`: `6`

## Chain 1

- Default (V3) vaults: `797`
- Onchain vaults: `795`
- Matched vaults: `698`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `97`
- Default errors: `374`
- Onchain errors: `248`

Top diff paths:

- `$.collaterals[5].vault.fees.accumulatedFeesAssets`: `12`
- `$.collaterals[5].vault.fees.accumulatedFeesShares`: `12`
- `$.collaterals[0].oraclePriceRaw.queryFailureReason`: `8`
- `$.oraclePriceRaw.queryFailureReason`: `8`
- `$.timestamp`: `8`
- `$.collaterals[0].vault.oraclePriceRaw.queryFailureReason`: `7`
- `$.oracle.adapters`: `7`
- `$.oracle.adapters[0]`: `7`
- `$.collaterals[0].vault.collaterals[2].oraclePriceRaw.amountOutAsk`: `6`
- `$.collaterals[0].vault.collaterals[2].oraclePriceRaw.amountOutBid`: `6`

Representative diff vaults:

- root `0x0087d6b548A98D8ADF93c9E1f9C0650c034B2C7f` (EVault): `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"66613000000000000000000"}` vs onchain `{"__type":"bigint","value":"67744850000000000000000"}`
- root `0x056f3a2E41d2778D3a0c0714439c53af2987718E` (EVault); issue vault `0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4`: `$.collaterals[4].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"24"}` vs onchain `{"__type":"bigint","value":"25"}`
- root `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000f1ec0000000000000000000000000000000000000000000000000000000000001c20"` vs onchain `"0xa6e68d6300000000000000000000000000000000000000000000000000000000000104040000000000000000000000000000000000000000000000000000000000001c20"`
- root `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069ca71530000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069ca857b0000000000000000000000000000000000000000000000000000000000000078"`
- root `0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[0].vault.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2073965000000000000000"}` vs onchain `{"__type":"bigint","value":"0"}`
- root `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9` (EVault); issue vault `0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4`: `$.collaterals[4].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"24"}` vs onchain `{"__type":"bigint","value":"25"}`
- root `0x1987c2DCf5674Cf90bEceBAd502714c357ce126a` (EVault); issue vault `0xD1552d878FE4869539ba4D03D207B54913a5C273`: `$.collaterals[15].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"98535830000000000000"}` vs onchain `{"__type":"bigint","value":"99827243440000000000"}`
- root `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5` (EVault); issue vault `0xc364FD9637fe562A2d5a1cbc7d1Ab7F32bE900ef`: `$.collaterals[0].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c224840000000000000000000000000000000000000000000000000000000000015180"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c235880000000000000000000000000000000000000000000000000000000000015180"`
- root `0x1B4715a2Ef8fecA45ACC2D19F780a33F34F498a0` (EulerEarn); issue vault `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`: `$.asset.name` value mismatch; default `"Unknown Asset"` vs onchain `""`
- root `0x21d3CeeAcced883d72f02f7D04Fb45218cAF8E27` (EulerEarn); issue vault `0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb`: `$.asset.name` value mismatch; default `"Unknown Asset"` vs onchain `""`
- root `0x27052EA5E307B6e8566D9eE560231C6742a6c03c` (EVault); issue vault `0xeE8693c11acE62839bB96beaE86696c1e78Aba3F`: `$.collaterals[0].vault.collaterals[2].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"66679322872590000000000"}` vs onchain `{"__type":"bigint","value":"68017944421250000000000"}`
- root `0x29B688A9E9dCe9abb28d46ab2e3Fb3c3F4EeFa90` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003c6d14000000000000000000000000000000000000000000000000000000000000afc8"` vs onchain `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003c7f5c000000000000000000000000000000000000000000000000000000000000afc8"`
- root `0x29D824d54Fd5118543E81637b8f865d045191F30` (EVault); issue vault `0xD1552d878FE4869539ba4D03D207B54913a5C273`: `$.collaterals[0].vault.collaterals[15].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"98535830000000000000"}` vs onchain `{"__type":"bigint","value":"99827243440000000000"}`
- root `0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245` (EulerEarn): `$.supplyApy1h` numeric values differ by more than 1%; default `0.03593293530157826` vs onchain `0.035302441948697236`
- root `0x2f3558213c050731b3ae632811eFc1562d3F91CC` (EulerEarn): `$.totalAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"100020851"}` vs onchain `{"__type":"bigint","value":"207"}`
- root `0x30049e1008A46dA13bcdEE35c2172EaB4De8Bb0B` (EulerEarn); issue vault `0x4f4Afcdd8E418f5AA9130BA53af23Cb7bf47F467`: `$.strategies[1].vault.collaterals[5].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"24"}` vs onchain `{"__type":"bigint","value":"25"}`
- root `0x3036155a3eD3e7F6FFf1E96e88f1FE51b6D2f3aD` (EVault); issue vault `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5`: `$.collaterals[0].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c224300000000000000000000000000000000000000000000000000000000000093a80"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c235880000000000000000000000000000000000000000000000000000000000093a80"`
- root `0x30DC3665d89175fc1C9E930915bec3f2Bb035D5d` (EVault); issue vault `0x4B155381472202FA2159F6221D0546128FBB8aC5`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2073063717630000000000"}` vs onchain `{"__type":"bigint","value":"0"}`
- root `0x313603FA690301b0CaeEf8069c065862f9162162` (EVault); issue vault `0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4`: `$.collaterals[5].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"24"}` vs onchain `{"__type":"bigint","value":"25"}`
- root `0x328646cdfBaD730432620d845B8F5A2f7D786C01` (EVault); issue vault `0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4`: `$.collaterals[5].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"24"}` vs onchain `{"__type":"bigint","value":"25"}`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x7065662E9C0410c6DDc3da66a878070c724D44D4` (EVault)
- `0xADc94A81934Fd5382B21daf0850B835e8415104C` (EVault)

