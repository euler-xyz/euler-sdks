# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-03-31T17:09:30.160Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `800`
- Onchain vaults: `742`
- Matched vaults: `530`
- Missing in default: `0`
- Missing in onchain: `58`
- Vaults with diffs: `212`
- Default errors: `952`
- Onchain errors: `801`

## Top diff paths

- `$.oraclePriceRaw.amountOutAsk`: `76`
- `$.oraclePriceRaw.amountOutBid`: `76`
- `$.oraclePriceRaw.amountOutMid`: `76`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x998d761ec1badaceb064624cc3a1d37a46c88ba4].oraclePriceRaw.amountOutAsk`: `58`

## Chain 1

- Default (V3) vaults: `800`
- Onchain vaults: `742`
- Matched vaults: `530`
- Missing in default: `0`
- Missing in onchain: `58`
- Vaults with diffs: `212`
- Default errors: `952`
- Onchain errors: `801`

Top diff paths:

- `$.oraclePriceRaw.amountOutAsk`: `76`
- `$.oraclePriceRaw.amountOutBid`: `76`
- `$.oraclePriceRaw.amountOutMid`: `76`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutBid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutMid`: `58`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x998d761ec1badaceb064624cc3a1d37a46c88ba4].oraclePriceRaw.amountOutAsk`: `58`

Representative diff vaults:

- root `0x038dd0Eb275B7DE3B07884f1Fa106eD6423C45F2` (EVault); issue vault `0xbBc4BC013F1C9Ed674098A6d156C02C0a21a285C`: `$.collaterals[@0xbbc4bc013f1c9ed674098a6d156c02c0a21a285c].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"69430508239239923440337"}` vs onchain `{"__type":"bigint","value":"70416083613307007108575"}`
- root `0x056575e43A440D49B14E94022Be9FAD85679D138` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"66487370467190000000000"}` vs onchain `{"__type":"bigint","value":"67886887935560000000000"}`
- root `0x056f3a2E41d2778D3a0c0714439c53af2987718E` (EVault); issue vault `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9`: `$.collaterals[@0x1924d7fab80d0623f0836cbf5258a7fa734ee9d9].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2223147993186730131520"}` vs onchain `{"__type":"bigint","value":"2251583015285206822939"}`
- root `0x0593aAfDc6e0fAa4D423C276cD3549c3953f6270` (EVault); issue vault `0xFA5EbcDfE10c7b1E00993ed36D06C98C7A76C4eb`: `$.collaterals[@0xfa5ebcdfe10c7b1e00993ed36d06c98c7a76c4eb].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2214181515957154045238"}` vs onchain `{"__type":"bigint","value":"2242501852854580913423"}`
- root `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault); issue vault `0x5232E711812aeEf3ad8B5c2c6f5229af1b45C343`: `$.collaterals[@0x5232e711812aeef3ad8b5c2c6f5229af1b45c343].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2527708472432112021140"}` vs onchain `{"__type":"bigint","value":"2581264422892843300135"}`
- root `0x09136DAC538B54994170a6905507a74562A80ed3` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67331711018039734577800"}` vs onchain `{"__type":"bigint","value":"68287499787770120000000"}`
- root `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cbf28b0000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cbffc30000000000000000000000000000000000000000000000000000000000000078"`
- root `0x09FcE883cC16894274802c01e3b9cD90EAE4e43d` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67331711018039734577800"}` vs onchain `{"__type":"bigint","value":"68287499787770120000000"}`
- root `0x0D1B386187be8e96680bbddBf7Bc05FC737f81b8` (EVault): `$.marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2393149971105512724195"}` vs onchain `{"__type":"bigint","value":"2423759391760204426229"}`
- root `0x0E88544bf60bbc748FA542B79e9aE3Cf18Db7F75` (EVault); issue vault `0x1926f5Bb9ed68BA83255fB219828a90Bd9F40771`: `$.collaterals[@0x1926f5bb9ed68ba83255fb219828a90bd9f40771].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2527708472432112021140"}` vs onchain `{"__type":"bigint","value":"2581264422892843300135"}`
- root `0x0f3CC0aF08538A9ec551aF53e4F0a19fD7273ed9` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"66487370467190000000000"}` vs onchain `{"__type":"bigint","value":"67886887935560000000000"}`
- root `0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2061811037710000000000"}` vs onchain `{"__type":"bigint","value":"2090180000000000000000"}`
- root `0x122e9eA082D8c060Bb1a3476aa18B9E739fBbAAf` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67331711018039734577800"}` vs onchain `{"__type":"bigint","value":"68287499787770120000000"}`
- root `0x14d777665EA3bb224f222E69c85bcA890557d078` (EVault); issue vault `0x43BC56b2E10AcAd2b0dc021F1C9866DB259CEb5B`: `$.collaterals[@0x43bc56b2e10acad2b0dc021f1c9866db259ceb5b].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"66868965074620000000000"}` vs onchain `{"__type":"bigint","value":"67818179000000000000000"}`
- root `0x15A60a5300c1D9179d4c0e2B49bac6146794Ae1F` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67331711018039734577800"}` vs onchain `{"__type":"bigint","value":"68287499787770120000000"}`
- root `0x17ec0701F4683239a4A388D6B3E322D1F874ABdC` (EVault); issue vault `0x5232E711812aeEf3ad8B5c2c6f5229af1b45C343`: `$.collaterals[@0x5232e711812aeef3ad8b5c2c6f5229af1b45c343].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2527708472432112021140"}` vs onchain `{"__type":"bigint","value":"2581264422892843300135"}`
- root `0x18979F3807237F3a4254F00dfFD6c047fb967912` (EVault); issue vault `0x5232E711812aeEf3ad8B5c2c6f5229af1b45C343`: `$.collaterals[@0x5232e711812aeef3ad8b5c2c6f5229af1b45c343].marketPriceUsd` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2527708472432112021140"}` vs onchain `{"__type":"bigint","value":"2581264422892843300135"}`
- root `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9` (EVault); issue vault `0x056f3a2E41d2778D3a0c0714439c53af2987718E`: `$.collaterals[@0x056f3a2e41d2778d3a0c0714439c53af2987718e].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"67331711686729385324000"}` vs onchain `{"__type":"bigint","value":"68287499787770120000000"}`
- root `0x1926f5Bb9ed68BA83255fB219828a90Bd9F40771` (EVault); issue vault `0x0E88544bf60bbc748FA542B79e9aE3Cf18Db7F75`: `$.collaterals[@0x0e88544bf60bbc748fa542b79e9ae3cf18db7f75].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2062204800000000000000"}` vs onchain `{"__type":"bigint","value":"2088581289130000000000"}`
- root `0x1987c2DCf5674Cf90bEceBAd502714c357ce126a` (EVault); issue vault `0x25C538cc5c5B4cDdf9a9A656f90d2d8129E841B2`: `$.collaterals[@0x25c538cc5c5b4cddf9a9a656f90d2d8129e841b2].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"8647770000000000000"}` vs onchain `{"__type":"bigint","value":"8786000000000000000"}`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x000997971B3C0D4d87a3Db59aA350f298a4e1730` (EVault)
- `0x04713cE12C7AE90e426E3aae2db48CeB26ff89cB` (EVault)
- `0x0cF9c2470949D01fd8301f89Ad8b34b2b04f82f2` (EVault)
- `0x0F737c7A634F03871ab97BfCE2C830B930E956aF` (EVault)
- `0x1A1b6E836a81AD98C15180ebC565187b66C3bF4b` (EVault)
- `0x1Cd028b971eBC0bf8a2c4fBf440112cAAf8cb6d5` (EVault)
- `0x283aC2b5f5c830E8a7Aac4ED160c47fA29F5CcC1` (EulerEarn)
- `0x2D986036060A5042005C896353D539086B048C06` (EulerEarn)
- `0x2ff5F1Ca35f5100226ac58E1BFE5aac56919443B` (EVault)
- `0x32Cf8bd02A916c3cf1E4Ccb9c7A00D4a3f96BfDF` (EulerEarn)
- `0x362bEE02992730fD3cf77Ce380674d6251BAEDC9` (EVault)
- `0x38940FcA26325409e275f47B3E8B7570622DbBc9` (EVault)
- `0x3B4802FDb0E5d74aA37d58FD77d63e93d4f9A4AF` (EulerEarn)
- `0x3cd3718f8f047aA32F775E2cb4245A164E1C99fB` (EulerEarn)
- `0x41d4FFEaF370C8C5f399255C658b786Ea061d8F5` (EVault)
- `0x49C5733d71511A78a3E12925ea832f49031c97e9` (EulerEarn)
- `0x4CB6b738f7d5A5864a6C113C70Eca1e2a7A03e90` (EVault)
- `0x53FDab35Fd3aA26577bAc29f098084fCBAbE502f` (EVault)
- `0x5668bf89c7394d8890556d8166Ab4Ee67c5aE7CA` (EVault)
- `0x59E03c1Db4F35BFfbA06B0451e199b17eFBC4A86` (EulerEarn)

