# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-04-01T15:54:44.852Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `807`
- Onchain vaults: `749`
- Matched vaults: `724`
- Missing in default: `0`
- Missing in onchain: `58`
- Vaults with diffs: `25`
- Default errors: `1086`
- Onchain errors: `809`

## Top diff paths

- `$.oraclePriceRaw.queryFailureReason`: `7`
- `$.governance.creator`: `4`
- `$.governance.owner`: `4`
- `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].oraclePriceRaw.queryFailureReason`: `3`
- `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].vault.collaterals[@0xc364fd9637fe562a2d5a1cbc7d1ab7f32be900ef].oraclePriceRaw.queryFailureReason`: `3`
- `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].vault.oraclePriceRaw.queryFailureReason`: `3`
- `$.governance.timelock`: `3`
- `$.availableAssets`: `2`
- `$.collaterals[@0x29b688a9e9dce9abb28d46ab2e3fb3c3f4eefa90].oraclePriceRaw.queryFailureReason`: `2`
- `$.collaterals[@0x29b688a9e9dce9abb28d46ab2e3fb3c3f4eefa90].vault.oraclePriceRaw.queryFailureReason`: `2`

## Chain 1

- Default (V3) vaults: `807`
- Onchain vaults: `749`
- Matched vaults: `724`
- Missing in default: `0`
- Missing in onchain: `58`
- Vaults with diffs: `25`
- Default errors: `1086`
- Onchain errors: `809`

Top diff paths:

- `$.oraclePriceRaw.queryFailureReason`: `7`
- `$.governance.creator`: `4`
- `$.governance.owner`: `4`
- `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].oraclePriceRaw.queryFailureReason`: `3`
- `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].vault.collaterals[@0xc364fd9637fe562a2d5a1cbc7d1ab7f32be900ef].oraclePriceRaw.queryFailureReason`: `3`
- `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].vault.oraclePriceRaw.queryFailureReason`: `3`
- `$.governance.timelock`: `3`
- `$.availableAssets`: `2`
- `$.collaterals[@0x29b688a9e9dce9abb28d46ab2e3fb3c3f4eefa90].oraclePriceRaw.queryFailureReason`: `2`
- `$.collaterals[@0x29b688a9e9dce9abb28d46ab2e3fb3c3f4eefa90].vault.oraclePriceRaw.queryFailureReason`: `2`

Representative diff vaults:

- root `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d63000000000000000000000000000000000000000000000000000000000001185c0000000000000000000000000000000000000000000000000000000000001c20"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000011b200000000000000000000000000000000000000000000000000000000000001c20"`
- root `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cd3af30000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cd3fbb0000000000000000000000000000000000000000000000000000000000000078"`
- root `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5` (EVault); issue vault `0xc364FD9637fe562A2d5a1cbc7d1Ab7F32bE900ef`: `$.collaterals[@0xc364fd9637fe562a2d5a1cbc7d1ab7f32be900ef].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c4ee180000000000000000000000000000000000000000000000000000000000015180"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c4efc80000000000000000000000000000000000000000000000000000000000015180"`
- root `0x283aC2b5f5c830E8a7Aac4ED160c47fA29F5CcC1` (EulerEarn): `$.availableAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"1840098899918352977260"}`
- root `0x29B688A9E9dCe9abb28d46ab2e3Fb3c3F4EeFa90` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003f36a8000000000000000000000000000000000000000000000000000000000000afc8"` vs onchain `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003f399c000000000000000000000000000000000000000000000000000000000000afc8"`
- root `0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245` (EulerEarn): `$.availableAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"1001969900798"}`
- root `0x3036155a3eD3e7F6FFf1E96e88f1FE51b6D2f3aD` (EVault); issue vault `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5`: `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c4edc40000000000000000000000000000000000000000000000000000000000093a80"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c4efc80000000000000000000000000000000000000000000000000000000000093a80"`
- root `0x30DC3665d89175fc1C9E930915bec3f2Bb035D5d` (EVault); issue vault `0x4B155381472202FA2159F6221D0546128FBB8aC5`: `$.collaterals[@0x4b155381472202fa2159f6221d0546128fbb8ac5].vault.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2132862499990000000000"}` vs onchain `{"__type":"bigint","value":"0"}`
- root `0x32Cf8bd02A916c3cf1E4Ccb9c7A00D4a3f96BfDF` (EulerEarn); issue vault `0x5BcA378719Ad01BB8e490d09e2326EDfEe66b954`: `$.strategies[@0xc6137bc1378c2396051e06417704d31615f77cb9].vault.collaterals[@0x5bca378719ad01bb8e490d09e2326edfee66b954].marketPriceUsd.__type` value mismatch; default `"undefined"` vs onchain `"bigint"`
- root `0x4B155381472202FA2159F6221D0546128FBB8aC5` (EVault): `$.oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2132862499990000000000"}` vs onchain `{"__type":"bigint","value":"0"}`
- root `0x53E657182B3357d14bdB6e495cC1731085d65D82` (EVault); issue vault `0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2`: `$.collaterals[@0xd8b27cf359b7d15710a5be299af6e7bf904984c2].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2202312460430942234854"}` vs onchain `{"__type":"bigint","value":"0"}`
- root `0x59E03c1Db4F35BFfbA06B0451e199b17eFBC4A86` (EulerEarn): `$.supplyApy1h` numeric values differ by more than 5%; default `0.03783303223376189` vs onchain `0.029032699536469742`
- root `0x5fB4B747F462D245927C60576702175E64D13FA5` (EVault); issue vault `0xc7C0d22618723396e1A1701CaF12cd9a6A7Af874`: `$.collaterals[@0xc7c0d22618723396e1a1701caf12cd9a6a7af874].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003f3618000000000000000000000000000000000000000000000000000000000000afc8"` vs onchain `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003f399c000000000000000000000000000000000000000000000000000000000000afc8"`
- root `0x63FAee5D5066bee90e54A88A2c6647235737cDf7` (EulerEarn): `$.governance.creator` value mismatch; default `"0x0000000000000000000000000000000000000000"` vs onchain `"0x59709B029B140C853FE28d277f83C3a65e308aF4"`
- root `0x77E8EcEBa525dbB05C6f1103c095D88882CE5187` (EVault); issue vault `0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2`: `$.collaterals[@0x53e657182b3357d14bdb6e495cc1731085d65d82].vault.collaterals[@0xd8b27cf359b7d15710a5be299af6e7bf904984c2].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2202312460430942234854"}` vs onchain `{"__type":"bigint","value":"0"}`
- root `0x7aFA6687B5f19FFf328b67FdeB8A5A77bA5eCc93` (EVault); issue vault `0x3B4802FDb0E5d74aA37d58FD77d63e93d4f9A4AF`: `$.collaterals[@0x3b4802fdb0e5d74aa37d58fd77d63e93d4f9a4af].vault.availableAssets` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"202723270897"}`
- root `0x864B715fE57Eb4a291B63c41c450FaEffb2248ba` (EulerEarn): `$.governance.creator` value mismatch; default `"0x0000000000000000000000000000000000000000"` vs onchain `"0x59709B029B140C853FE28d277f83C3a65e308aF4"`
- root `0x8fdd241cECebE8C288688288Eb4baB119A3673F8` (EVault); issue vault `0x29B688A9E9dCe9abb28d46ab2e3Fb3c3F4EeFa90`: `$.collaterals[@0x29b688a9e9dce9abb28d46ab2e3fb3c3f4eefa90].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003f3558000000000000000000000000000000000000000000000000000000000000afc8"` vs onchain `"0xa6e68d6300000000000000000000000000000000000000000000000000000000003f399c000000000000000000000000000000000000000000000000000000000000afc8"`
- root `0xBAfC1A885e25C6F594e06F12edaeB46858547724` (EVault); issue vault `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5`: `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c4ed340000000000000000000000000000000000000000000000000000000000093a80"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c4efc80000000000000000000000000000000000000000000000000000000000093a80"`
- root `0xC42d337861878baa4dC820D9E6B6C667C2b57e8A` (EVault); issue vault `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5`: `$.collaterals[@0x1ab9e92cfde84f38868753d30ffc43f812b803c5].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c4ebfc0000000000000000000000000000000000000000000000000000000000093a80"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c4efc80000000000000000000000000000000000000000000000000000000000093a80"`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x000997971B3C0D4d87a3Db59aA350f298a4e1730` (EVault)
- `0x04713cE12C7AE90e426E3aae2db48CeB26ff89cB` (EVault)
- `0x0cF9c2470949D01fd8301f89Ad8b34b2b04f82f2` (EVault)
- `0x0F737c7A634F03871ab97BfCE2C830B930E956aF` (EVault)
- `0x1A1b6E836a81AD98C15180ebC565187b66C3bF4b` (EVault)
- `0x1Cd028b971eBC0bf8a2c4fBf440112cAAf8cb6d5` (EVault)
- `0x28dc636aE2f48065AF67A7c92fAb195D6caCe8cB` (EVault)
- `0x297F75783451D8896662d9aDf382d4Ec1f226c59` (EVault)
- `0x2D986036060A5042005C896353D539086B048C06` (EulerEarn)
- `0x2ff5F1Ca35f5100226ac58E1BFE5aac56919443B` (EVault)
- `0x362bEE02992730fD3cf77Ce380674d6251BAEDC9` (EVault)
- `0x38940FcA26325409e275f47B3E8B7570622DbBc9` (EVault)
- `0x3B4802FDb0E5d74aA37d58FD77d63e93d4f9A4AF` (EulerEarn)
- `0x3cd3718f8f047aA32F775E2cb4245A164E1C99fB` (EulerEarn)
- `0x41d4FFEaF370C8C5f399255C658b786Ea061d8F5` (EVault)
- `0x41D8437Feea5B480d498f62970d9674C09DdC112` (EVault)
- `0x49C5733d71511A78a3E12925ea832f49031c97e9` (EulerEarn)
- `0x4CB6b738f7d5A5864a6C113C70Eca1e2a7A03e90` (EVault)
- `0x53FDab35Fd3aA26577bAc29f098084fCBAbE502f` (EVault)
- `0x5668bf89c7394d8890556d8166Ab4Ee67c5aE7CA` (EVault)

