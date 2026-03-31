# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-03-31T09:50:20.178Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `800`
- Onchain vaults: `798`
- Matched vaults: `703`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `95`
- Default errors: `348`
- Onchain errors: `255`

## Top diff paths

- `$.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutAsk`: `11`
- `$.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutBid`: `11`
- `$.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutMid`: `11`
- `$.collaterals[@0x28420e3d8c6c4266c9d72ab75db78705832f9ea2].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk`: `10`
- `$.collaterals[@0x28420e3d8c6c4266c9d72ab75db78705832f9ea2].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutBid`: `10`
- `$.collaterals[@0x28420e3d8c6c4266c9d72ab75db78705832f9ea2].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutMid`: `10`
- `$.collaterals[@0x3d7f077e477a642d4e6801d7d9d65c5d5916fd0a].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk`: `10`
- `$.collaterals[@0x3d7f077e477a642d4e6801d7d9d65c5d5916fd0a].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutBid`: `10`
- `$.collaterals[@0x3d7f077e477a642d4e6801d7d9d65c5d5916fd0a].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutMid`: `10`
- `$.collaterals[@0x4730c467960f543678f2d5041bd9f2f6ba39eaba].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk`: `10`

## Chain 1

- Default (V3) vaults: `800`
- Onchain vaults: `798`
- Matched vaults: `703`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `95`
- Default errors: `348`
- Onchain errors: `255`

Top diff paths:

- `$.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutAsk`: `11`
- `$.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutBid`: `11`
- `$.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutMid`: `11`
- `$.collaterals[@0x28420e3d8c6c4266c9d72ab75db78705832f9ea2].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk`: `10`
- `$.collaterals[@0x28420e3d8c6c4266c9d72ab75db78705832f9ea2].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutBid`: `10`
- `$.collaterals[@0x28420e3d8c6c4266c9d72ab75db78705832f9ea2].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutMid`: `10`
- `$.collaterals[@0x3d7f077e477a642d4e6801d7d9d65c5d5916fd0a].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk`: `10`
- `$.collaterals[@0x3d7f077e477a642d4e6801d7d9d65c5d5916fd0a].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutBid`: `10`
- `$.collaterals[@0x3d7f077e477a642d4e6801d7d9d65c5d5916fd0a].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutMid`: `10`
- `$.collaterals[@0x4730c467960f543678f2d5041bd9f2f6ba39eaba].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk`: `10`

Representative diff vaults:

- root `0x056575e43A440D49B14E94022Be9FAD85679D138` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67849707563320000000000"}` vs onchain `{"__type":"bigint","value":"66487370467190000000000"}`
- root `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000bf100000000000000000000000000000000000000000000000000000000000001c20"` vs onchain `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000c5c40000000000000000000000000000000000000000000000000000000000001c20"`
- root `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cb901b0000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cb98d30000000000000000000000000000000000000000000000000000000000000078"`
- root `0x0f3CC0aF08538A9ec551aF53e4F0a19fD7273ed9` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67849707563320000000000"}` vs onchain `{"__type":"bigint","value":"66487370467190000000000"}`
- root `0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x8b5b205ae1e241974d06695a1f09612069b46d6b].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2025160000000000000000"}`
- root `0x14d777665EA3bb224f222E69c85bcA890557d078` (EVault); issue vault `0x47e2ab1392e04C1d86E696012D0544aedBDA6Ddb`: `$.collaterals[@0x43bc56b2e10acad2b0dc021f1c9866db259ceb5b].vault.collaterals[@0x47e2ab1392e04c1d86e696012d0544aedbda6ddb].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67849707563320000000000"}` vs onchain `{"__type":"bigint","value":"66487370467190000000000"}`
- root `0x1987c2DCf5674Cf90bEceBAd502714c357ce126a` (EVault); issue vault `0xF6E2EfDF175e7a91c8847dade42f2d39A9aE57D4`: `$.collaterals[@0x25c538cc5c5b4cddf9a9a656f90d2d8129e841b2].vault.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2520459238594416924911"}` vs onchain `{"__type":"bigint","value":"2494737683651895223149"}`
- root `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5` (EVault); issue vault `0xc364FD9637fe562A2d5a1cbc7d1Ab7F32bE900ef`: `$.collaterals[@0xc364fd9637fe562a2d5a1cbc7d1ab7f32be900ef].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c343400000000000000000000000000000000000000000000000000000000000015180"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c348e00000000000000000000000000000000000000000000000000000000000015180"`
- root `0x1E053f8dc25AdDA8116473fA64958cda5d937CE9` (EVault); issue vault `0xdD53C053962771075085Fd22950c1e8fEd669dCa`: `$.collaterals[@0xdfd1cddbbd9cbeb274dc45a91e1a40939faa1ab6].vault.collaterals[@0xdd53c053962771075085fd22950c1e8fed669dca].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67849707563320000000000"}` vs onchain `{"__type":"bigint","value":"66487370467190000000000"}`
- root `0x25C538cc5c5B4cDdf9a9A656f90d2d8129E841B2` (EVault); issue vault `0xF6E2EfDF175e7a91c8847dade42f2d39A9aE57D4`: `$.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2520459238594416924911"}` vs onchain `{"__type":"bigint","value":"2494737683651895223149"}`
- root `0x27052EA5E307B6e8566D9eE560231C6742a6c03c` (EVault); issue vault `0xc41252D4F61D25658cD83Cc39942c49776E1B0C5`: `$.collaterals[@0x67e4e4e73947257ca62d118e0fbc56d06f11d96f].vault.collaterals[@0xc41252d4f61d25658cd83cc39942c49776e1b0c5].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2520459238594416924911"}` vs onchain `{"__type":"bigint","value":"2494737683651895223149"}`
- root `0x28420e3D8c6C4266c9d72ab75DB78705832F9EA2` (EVault); issue vault `0xdfFf70138fc73F0D71045Ab51335f8a33fED4467`: `$.collaterals[@0x3d7f077e477a642d4e6801d7d9d65c5d5916fd0a].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67849707563320000000000"}` vs onchain `{"__type":"bigint","value":"66487370467190000000000"}`
- root `0x28c6F8D44179ac93a5EBAe24189d887eeEF38cea` (EVault); issue vault `0xF6E2EfDF175e7a91c8847dade42f2d39A9aE57D4`: `$.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2520459238594416924911"}` vs onchain `{"__type":"bigint","value":"2494737683651895223149"}`
- root `0x29B688A9E9dCe9abb28d46ab2e3Fb3c3F4EeFa90` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003d8bd0000000000000000000000000000000000000000000000000000000000000afc8"` vs onchain `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003d92b4000000000000000000000000000000000000000000000000000000000000afc8"`
- root `0x29D824d54Fd5118543E81637b8f865d045191F30` (EVault); issue vault `0xF6E2EfDF175e7a91c8847dade42f2d39A9aE57D4`: `$.collaterals[@0x1987c2dcf5674cf90becebad502714c357ce126a].vault.collaterals[@0xf6e2efdf175e7a91c8847dade42f2d39a9ae57d4].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2520459238594416924911"}` vs onchain `{"__type":"bigint","value":"2494737683651895223149"}`
- root `0x2a68bf3CE9012Be2574262DF9b142f2bE6b6E1C2` (EVault); issue vault `0xdfFf70138fc73F0D71045Ab51335f8a33fED4467`: `$.collaterals[@0x28420e3d8c6c4266c9d72ab75db78705832f9ea2].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67849707563320000000000"}` vs onchain `{"__type":"bigint","value":"66487370467190000000000"}`
- root `0x2e37454Cf13E895254cE8fd6a3D35fFD71059bF2` (EVault); issue vault `0xdfFf70138fc73F0D71045Ab51335f8a33fED4467`: `$.collaterals[@0x28420e3d8c6c4266c9d72ab75db78705832f9ea2].vault.collaterals[@0xdfff70138fc73f0d71045ab51335f8a33fed4467].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67849707563320000000000"}` vs onchain `{"__type":"bigint","value":"66487370467190000000000"}`
- root `0x2f3558213c050731b3ae632811eFc1562d3F91CC` (EulerEarn): `$.totalAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"100020851"}` vs onchain `{"__type":"bigint","value":"207"}`
- root `0x3036155a3eD3e7F6FFf1E96e88f1FE51b6D2f3aD` (EVault); issue vault `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5`: `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c342ec0000000000000000000000000000000000000000000000000000000000093a80"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c348e00000000000000000000000000000000000000000000000000000000000093a80"`
- root `0x30DC3665d89175fc1C9E930915bec3f2Bb035D5d` (EVault); issue vault `0x4B155381472202FA2159F6221D0546128FBB8aC5`: `$.collaterals[@0x4b155381472202fa2159f6221d0546128fbb8ac5].vault.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2025160000000000000000"}`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x7065662E9C0410c6DDc3da66a878070c724D44D4` (EVault)
- `0xADc94A81934Fd5382B21daf0850B835e8415104C` (EVault)

