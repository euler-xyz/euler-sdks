# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-03-30T12:04:21.360Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `797`
- Onchain vaults: `795`
- Matched vaults: `692`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `103`
- Default errors: `373`
- Onchain errors: `244`

## Top diff paths

- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk`: `32`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutBid`: `32`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutMid`: `32`
- `$.collaterals[0].vault.collaterals[10].oraclePriceRaw.amountOutAsk`: `22`
- `$.collaterals[0].vault.collaterals[10].oraclePriceRaw.amountOutBid`: `22`
- `$.collaterals[0].vault.collaterals[10].oraclePriceRaw.amountOutMid`: `22`
- `$.collaterals[0].vault.collaterals[5].oraclePriceRaw.amountOutAsk`: `22`
- `$.collaterals[0].vault.collaterals[5].oraclePriceRaw.amountOutBid`: `22`
- `$.collaterals[0].vault.collaterals[5].oraclePriceRaw.amountOutMid`: `22`
- `$.collaterals[0].vault.collaterals[7].oraclePriceRaw.amountOutAsk`: `22`

## Chain 1

- Default (V3) vaults: `797`
- Onchain vaults: `795`
- Matched vaults: `692`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `103`
- Default errors: `373`
- Onchain errors: `244`

Top diff paths:

- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk`: `32`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutBid`: `32`
- `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutMid`: `32`
- `$.collaterals[0].vault.collaterals[10].oraclePriceRaw.amountOutAsk`: `22`
- `$.collaterals[0].vault.collaterals[10].oraclePriceRaw.amountOutBid`: `22`
- `$.collaterals[0].vault.collaterals[10].oraclePriceRaw.amountOutMid`: `22`
- `$.collaterals[0].vault.collaterals[5].oraclePriceRaw.amountOutAsk`: `22`
- `$.collaterals[0].vault.collaterals[5].oraclePriceRaw.amountOutBid`: `22`
- `$.collaterals[0].vault.collaterals[5].oraclePriceRaw.amountOutMid`: `22`
- `$.collaterals[0].vault.collaterals[7].oraclePriceRaw.amountOutAsk`: `22`

Representative diff vaults:

- root `0x056f3a2E41d2778D3a0c0714439c53af2987718E` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2211058824196294906385"}` vs onchain `{"__type":"bigint","value":"2234550675719194973284"}`
- root `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000e3d00000000000000000000000000000000000000000000000000000000000001c20"` vs onchain `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000e4f00000000000000000000000000000000000000000000000000000000000001c20"`
- root `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069ca63430000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069ca66670000000000000000000000000000000000000000000000000000000000000078"`
- root `0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"2068890000000000000000"}`
- root `0x14d777665EA3bb224f222E69c85bcA890557d078` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2524017322594040958795"}` vs onchain `{"__type":"bigint","value":"2550834266235685599815"}`
- root `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9` (EVault): `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2211058824196294906385"}` vs onchain `{"__type":"bigint","value":"2234550675719194973284"}`
- root `0x1987c2DCf5674Cf90bEceBAd502714c357ce126a` (EVault); issue vault `0x777a7a579d7cCa0c909D1F55bE93dCBf872ACED6`: `$.collaterals[5].vault.collaterals[1].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2203403541096862706937"}` vs onchain `{"__type":"bigint","value":"2226814057360937693865"}`
- root `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5` (EVault); issue vault `0xc364FD9637fe562A2d5a1cbc7d1Ab7F32bE900ef`: `$.collaterals[0].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c208640000000000000000000000000000000000000000000000000000000000015180"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c216740000000000000000000000000000000000000000000000000000000000015180"`
- root `0x1B4715a2Ef8fecA45ACC2D19F780a33F34F498a0` (EulerEarn); issue vault `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`: `$.asset.name` value mismatch; default `"Unknown Asset"` vs onchain `""`
- root `0x21d3CeeAcced883d72f02f7D04Fb45218cAF8E27` (EulerEarn); issue vault `0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb`: `$.asset.name` value mismatch; default `"Unknown Asset"` vs onchain `""`
- root `0x27052EA5E307B6e8566D9eE560231C6742a6c03c` (EVault); issue vault `0x67e4e4e73947257Ca62D118E0FBC56D06f11d96F`: `$.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2090580889730998630017"}` vs onchain `{"__type":"bigint","value":"2112793728116081876860"}`
- root `0x29A9E5A004002Ff9E960bb8BB536E076F53cbDF1` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2211058824196294906385"}` vs onchain `{"__type":"bigint","value":"2234550675719194973284"}`
- root `0x29B688A9E9dCe9abb28d46ab2e3Fb3c3F4EeFa90` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003c5ef8000000000000000000000000000000000000000000000000000000000000afc8"` vs onchain `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003c6048000000000000000000000000000000000000000000000000000000000000afc8"`
- root `0x29D824d54Fd5118543E81637b8f865d045191F30` (EVault); issue vault `0x777a7a579d7cCa0c909D1F55bE93dCBf872ACED6`: `$.collaterals[6].vault.collaterals[1].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2203403541096862706937"}` vs onchain `{"__type":"bigint","value":"2226814057360937693865"}`
- root `0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245` (EulerEarn): `$.supplyApy1h` numeric values differ by more than 1%; default `0.0356207160958153` vs onchain `0.035000953389181584`
- root `0x2f3558213c050731b3ae632811eFc1562d3F91CC` (EulerEarn): `$.totalAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"100020851"}` vs onchain `{"__type":"bigint","value":"207"}`
- root `0x30049e1008A46dA13bcdEE35c2172EaB4De8Bb0B` (EulerEarn); issue vault `0x2DA35f6e88Eaba4E705Bff7154B259859C353953`: `$.strategies[1].vault.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2211058824196294906385"}` vs onchain `{"__type":"bigint","value":"2234550675719194973284"}`
- root `0x3036155a3eD3e7F6FFf1E96e88f1FE51b6D2f3aD` (EVault); issue vault `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5`: `$.collaterals[0].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c216140000000000000000000000000000000000000000000000000000000000093a80"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c216740000000000000000000000000000000000000000000000000000000000093a80"`
- root `0x313603FA690301b0CaeEf8069c065862f9162162` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2211058824196294906385"}` vs onchain `{"__type":"bigint","value":"2234550675719194973284"}`
- root `0x328646cdfBaD730432620d845B8F5A2f7D786C01` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[0].vault.collaterals[0].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2211058824196294906385"}` vs onchain `{"__type":"bigint","value":"2234550675719194973284"}`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x7065662E9C0410c6DDc3da66a878070c724D44D4` (EVault)
- `0xADc94A81934Fd5382B21daf0850B835e8415104C` (EVault)

