# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-03-31T14:02:20.416Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `800`
- Onchain vaults: `798`
- Matched vaults: `583`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `215`
- Default errors: `961`
- Onchain errors: `803`

## Top diff paths

- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xa28c23a459ff8773eb4dbe0e7250d93f79f1fe2b].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xa28c23a459ff8773eb4dbe0e7250d93f79f1fe2b].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xa28c23a459ff8773eb4dbe0e7250d93f79f1fe2b].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xd8b27cf359b7d15710a5be299af6e7bf904984c2].oraclePriceRaw.amountOutAsk`: `58`

## Chain 1

- Default (V3) vaults: `800`
- Onchain vaults: `798`
- Matched vaults: `583`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `215`
- Default errors: `961`
- Onchain errors: `803`

Top diff paths:

- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xa28c23a459ff8773eb4dbe0e7250d93f79f1fe2b].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xa28c23a459ff8773eb4dbe0e7250d93f79f1fe2b].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xa28c23a459ff8773eb4dbe0e7250d93f79f1fe2b].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0xd8b27cf359b7d15710a5be299af6e7bf904984c2].oraclePriceRaw.amountOutAsk`: `58`

Representative diff vaults:

- root `0x056f3a2E41d2778D3a0c0714439c53af2987718E` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2214321300835824573515"}` vs onchain `{"__type":"bigint","value":"2237370123789819786960"}`
- root `0x0593aAfDc6e0fAa4D423C276cD3549c3953f6270` (EVault); issue vault `0xFA5EbcDfE10c7b1E00993ed36D06C98C7A76C4eb`: `$.collaterals[@0xfa5ebcdfe10c7b1e00993ed36d06c98c7a76c4eb].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2205390424084810798532"}` vs onchain `{"__type":"bigint","value":"2228346285661264050925"}`
- root `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault); issue vault `0xe44eb816F7c6B5A3Bec1F49F821e9eb9b19c38E1`: `$.collaterals[@0xe44eb816f7c6b5a3bec1f49f821e9eb9b19c38e1].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2229339407846816029061"}` vs onchain `{"__type":"bigint","value":"2252544553881083802517"}`
- root `0x09136DAC538B54994170a6905507a74562A80ed3` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2214321300811416125396"}` vs onchain `{"__type":"bigint","value":"2237370123789819786960"}`
- root `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cbc85b0000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cbd3e30000000000000000000000000000000000000000000000000000000000000078"`
- root `0x09FcE883cC16894274802c01e3b9cD90EAE4e43d` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2214321300811416125396"}` vs onchain `{"__type":"bigint","value":"2237370123789819786960"}`
- root `0x0D1B386187be8e96680bbddBf7Bc05FC737f81b8` (EVault): `$.marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2383648310510541315208"}` vs onchain `{"__type":"bigint","value":"2408459654599755686766"}`
- root `0x0E88544bf60bbc748FA542B79e9aE3Cf18Db7F75` (EVault): `$.collaterals[@0x1926f5bb9ed68ba83255fb219828a90bd9f40771].vault.collaterals[@0x0e88544bf60bbc748fa542b79e9ae3cf18db7f75].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2054017110000000000000"}` vs onchain `{"__type":"bigint","value":"2075397330000000000000"}`
- root `0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2057174722230000000000"}` vs onchain `{"__type":"bigint","value":"0"}`
- root `0x122e9eA082D8c060Bb1a3476aa18B9E739fBbAAf` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2214321300811416125396"}` vs onchain `{"__type":"bigint","value":"2237370123789819786960"}`
- root `0x14d777665EA3bb224f222E69c85bcA890557d078` (EVault): `$.collaterals[@0x43bc56b2e10acad2b0dc021f1c9866db259ceb5b].vault.collaterals[@0x14d777665ea3bb224f222e69c85bca890557d078].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2527954396108402035083"}` vs onchain `{"__type":"bigint","value":"2554267819144476344784"}`
- root `0x15A60a5300c1D9179d4c0e2B49bac6146794Ae1F` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2214321300811416125396"}` vs onchain `{"__type":"bigint","value":"2237370123789819786960"}`
- root `0x17ec0701F4683239a4A388D6B3E322D1F874ABdC` (EVault); issue vault `0xe44eb816F7c6B5A3Bec1F49F821e9eb9b19c38E1`: `$.collaterals[@0xe44eb816f7c6b5a3bec1f49f821e9eb9b19c38e1].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2229339407846816029061"}` vs onchain `{"__type":"bigint","value":"2252544553881083802517"}`
- root `0x18979F3807237F3a4254F00dfFD6c047fb967912` (EVault); issue vault `0xe44eb816F7c6B5A3Bec1F49F821e9eb9b19c38E1`: `$.collaterals[@0xe44eb816f7c6b5a3bec1f49f821e9eb9b19c38e1].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2229339407846816029061"}` vs onchain `{"__type":"bigint","value":"2252544553881083802517"}`
- root `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9` (EVault): `$.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2214321300835824573515"}` vs onchain `{"__type":"bigint","value":"2237370123789819786960"}`
- root `0x1926f5Bb9ed68BA83255fB219828a90Bd9F40771` (EVault); issue vault `0x0E88544bf60bbc748FA542B79e9aE3Cf18Db7F75`: `$.collaterals[@0x0e88544bf60bbc748fa542b79e9ae3cf18db7f75].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2054017110000000000000"}` vs onchain `{"__type":"bigint","value":"2075397330000000000000"}`
- root `0x1987c2DCf5674Cf90bEceBAd502714c357ce126a` (EVault); issue vault `0x777a7a579d7cCa0c909D1F55bE93dCBf872ACED6`: `$.collaterals[@0x25c538cc5c5b4cddf9a9a656f90d2d8129e841b2].vault.collaterals[@0x777a7a579d7cca0c909d1f55be93dcbf872aced6].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2205466343585909172660"}` vs onchain `{"__type":"bigint","value":"2228422995406819431296"}`
- root `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5` (EVault); issue vault `0xc364FD9637fe562A2d5a1cbc7d1Ab7F32bE900ef`: `$.collaterals[@0xc364fd9637fe562a2d5a1cbc7d1ab7f32be900ef].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c37b800000000000000000000000000000000000000000000000000000000000015180"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c383f00000000000000000000000000000000000000000000000000000000000015180"`
- root `0x1E053f8dc25AdDA8116473fA64958cda5d937CE9` (EVault): `$.collaterals[@0x7b7161eb9195cf775d8b3d6026c1c44af4a1b440].vault.collaterals[@0x1e053f8dc25adda8116473fa64958cda5d937ce9].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2052563230000000000000"}` vs onchain `{"__type":"bigint","value":"2075428041080000000000"}`
- root `0x211711F277f146fC947D7053B41BB71BB5b5FC2C` (EVault); issue vault `0x9B62c8D69AcB1397f585BA63eee2597c5Bd0f644`: `$.collaterals[@0x9b62c8d69acb1397f585ba63eee2597c5bd0f644].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2174981983886466369900"}` vs onchain `{"__type":"bigint","value":"2197621324661738249700"}`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x7065662E9C0410c6DDc3da66a878070c724D44D4` (EVault)
- `0xADc94A81934Fd5382B21daf0850B835e8415104C` (EVault)

