# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-04-13T09:35:07.330Z.

## Totals

- Chains compared: `1`
- Filtered to labeled root vaults: `false`
- Price diff tolerance: `1%`
- Default (V3) vaults: `816`
- Onchain vaults: `835`
- Matched vaults: `793`
- Missing in default: `21`
- Missing in onchain: `2`
- Vaults with diffs: `21`
- Default errors: `1939`
- Onchain errors: `822`

## Top diff paths

- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk`: `5`
- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutBid`: `5`
- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutMid`: `5`
- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.queryFailure`: `5`
- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.queryFailureReason`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutBid`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutMid`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.queryFailure`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.queryFailureReason`: `5`

## Chain 1

- Default (V3) vaults: `816`
- Onchain vaults: `835`
- Matched vaults: `793`
- Missing in default: `21`
- Missing in onchain: `2`
- Vaults with diffs: `21`
- Default errors: `1939`
- Onchain errors: `822`

Top diff paths:

- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk`: `5`
- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutBid`: `5`
- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutMid`: `5`
- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.queryFailure`: `5`
- `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.queryFailureReason`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutBid`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutMid`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.queryFailure`: `5`
- `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.queryFailureReason`: `5`

Representative diff vaults:

- root `0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0x30DC3665d89175fc1C9E930915bec3f2Bb035D5d` (EVault); issue vault `0x4B155381472202FA2159F6221D0546128FBB8aC5`: `$.collaterals[@0x4b155381472202fa2159f6221d0546128fbb8ac5].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0x32Cf8bd02A916c3cf1E4Ccb9c7A00D4a3f96BfDF` (EulerEarn); issue vault `0x5BcA378719Ad01BB8e490d09e2326EDfEe66b954`: `$.strategies[@0xc6137bc1378c2396051e06417704d31615f77cb9].vault.collaterals[@0x5bca378719ad01bb8e490d09e2326edfee66b954].marketPriceUsd.__type` value mismatch; default `"undefined"` vs onchain `"bigint"`
- root `0x33e97864E44631e6d31b81051DAABcD4C31bF792` (EVault): `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0x3CB462bbd9a683d05BE3302372Dd3cB81830FC29` (EulerEarn): `$.strategies` array length mismatch; default `0` vs onchain `2`
- root `0x3cd3718f8f047aA32F775E2cb4245A164E1C99fB` (EulerEarn): `$.supplyApy1h` numeric values differ by more than 5%; default `0.30016945119197636` vs onchain `0.23630487073953718`
- root `0x49C5733d71511A78a3E12925ea832f49031c97e9` (EulerEarn): `$.governance.pendingTimelockValidAt` numeric values differ by more than 1%; default `0` vs onchain `1762596899`
- root `0x4B155381472202FA2159F6221D0546128FBB8aC5` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0x53E657182B3357d14bdB6e495cC1731085d65D82` (EVault); issue vault `0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2`: `$.collaterals[@0xd8b27cf359b7d15710a5be299af6e7bf904984c2].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2265401152689654473538"}`
- root `0x59E03c1Db4F35BFfbA06B0451e199b17eFBC4A86` (EulerEarn): `$.supplyApy1h` numeric values differ by more than 5%; default `0.03533608303092284` vs onchain `0.026900477769377498`
- root `0x5d0C14A46eBb659dDccd5b8F5e9707a5714857a0` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0x77E8EcEBa525dbB05C6f1103c095D88882CE5187` (EVault); issue vault `0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2`: `$.collaterals[@0x53e657182b3357d14bdb6e495cc1731085d65d82].vault.collaterals[@0xd8b27cf359b7d15710a5be299af6e7bf904984c2].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2265401152689654473538"}`
- root `0x879aEC0aAE98AC89598ae8F765EB9A9ee307d16f` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0x8B5b205aE1E241974d06695a1f09612069B46d6B` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0x8F3BF4D836887076692e9745a7A55A28Cae98107` (EulerEarn); issue vault `0x14e314d5d53fd7Ad21d7d40046DfD98f183d22F1`: `$.strategies[@0x14e314d5d53fd7ad21d7d40046dfd98f183d22f1].vaultType` value mismatch; default `"Unknown"` vs onchain `"EVault"`
- root `0x93fEDd4b8D0e177EC884B88a432Aa2F8670E3118` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0x9B5aac9c6C70d5a583f44DDd13DF25AcC431fca4` (EulerEarn); issue vault `0x01864aE3c7d5f507cC4c24cA67B4CABbDdA37EcD`: `$.strategies[@0x01864ae3c7d5f507cc4c24ca67b4cabbdda37ecd].removableAt` numeric values differ by more than 1%; default `0` vs onchain `1762316867`
- root `0xB4a2fC3adAF3BfA8FCBA2A6FDAA200De106B8825` (EulerEarn): `$.strategies` array length mismatch; default `0` vs onchain `4`
- root `0xbB118Aa3Ee6eE1941fC33eeb3889d41c639736C6` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x10e0b2b42874adf8c29d5f900c0d18b61f048ffb].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2189264999990000000000"}`
- root `0xd217A07493b6BA272Ff806EE5eaBdFF86C292cc6` (EulerEarn): `$.governance.pendingTimelockValidAt` numeric values differ by more than 1%; default `0` vs onchain `1762597127`

Representative vaults missing in default:

- `0x12D25dDDD45B3bcDD6080EC8FDf19Fa84d1391d3` (EVault)
- `0x14e314d5d53fd7Ad21d7d40046DfD98f183d22F1` (EVault)
- `0x17c581c90E2305A55C1e61e8676D6Dc8092DDA47` (EVault)
- `0x18f1D2d918053eCF3Df0f6A581817A091d1E771E` (EVault)
- `0x1990aC8244F7249eA2AF06D86c4a3317C299B62D` (EVault)
- `0x2C8eeF55f98C1f5094874FbD2A9854Df672cf43c` (EVault)
- `0x5108b9a91132a3052963271CBc5c7c1484DA428e` (EVault)
- `0x5c4943d170eBf608fC637BF32b9572CAB9656cEF` (EVault)
- `0x6764015f3E54be1a2535558499b377aBC720D08A` (EVault)
- `0x6A0485b788bF6547248e04D3fe63352A73e59570` (EVault)
- `0x7764B49c156123E87e4953707e77697aF22A1008` (EVault)
- `0x82bc9b419cec3aEfDBFBfefef1DA625Bd8086927` (EVault)
- `0x85FBF7FfeC13DEA58dE0e611CbE2460f8C677C8C` (EVault)
- `0x9083E7AEd4192C8dC8ad799aCb6E1fAE23b46f6c` (EVault)
- `0x91A42EEDBE8ed78c4aE123584ce759CA930193A1` (EVault)
- `0x99504F8B31e393666a0EabaeBAa8200956442b01` (EVault)
- `0x99b42158986476Dc72D7688861bB9bE21993EBBb` (EVault)
- `0xCDeedea579f96147B93b9c792C337d37ce53C4C6` (EVault)
- `0xf1f174f34defC276FF5a05d077e4eA2BB09246FF` (EVault)
- `0xf216Adb3AEc8899b8514066DCC903dCd1DdF7777` (EVault)

Representative vaults missing in onchain:

- `0x7065662E9C0410c6DDc3da66a878070c724D44D4` (EVault)
- `0xADc94A81934Fd5382B21daf0850B835e8415104C` (EVault)

