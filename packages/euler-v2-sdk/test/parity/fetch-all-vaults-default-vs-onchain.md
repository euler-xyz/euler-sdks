# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-03-26T16:09:28.807Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `796`
- Onchain vaults: `794`
- Matched vaults: `197`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `597`
- Default errors: `343`
- Onchain errors: `247`

## Top diff paths

- `$.oracle.adapters`: `408`
- `$.interestRateModel.data`: `403`
- `$.interestRateModel.type`: `403`
- `$.oracle.adapters[1]`: `378`
- `$.collaterals[0].oracleAdapters`: `336`
- `$.oracle.adapters[2]`: `325`
- `$.collaterals[0].oracleAdapters[0]`: `323`
- `$.oracle.adapters[0]`: `296`
- `$.oracle.adapters[3]`: `293`
- `$.collaterals[1].oracleAdapters`: `269`

## Chain 1

- Default (V3) vaults: `796`
- Onchain vaults: `794`
- Matched vaults: `197`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `597`
- Default errors: `343`
- Onchain errors: `247`

Top diff paths:

- `$.oracle.adapters`: `408`
- `$.interestRateModel.data`: `403`
- `$.interestRateModel.type`: `403`
- `$.oracle.adapters[1]`: `378`
- `$.collaterals[0].oracleAdapters`: `336`
- `$.oracle.adapters[2]`: `325`
- `$.collaterals[0].oracleAdapters[0]`: `323`
- `$.oracle.adapters[0]`: `296`
- `$.oracle.adapters[3]`: `293`
- `$.collaterals[1].oracleAdapters`: `269`

Representative diff vaults:

- `0x000997971B3C0D4d87a3Db59aA350f298a4e1730` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x0087d6b548A98D8ADF93c9E1f9C0650c034B2C7f` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x01864aE3c7d5f507cC4c24cA67B4CABbDdA37EcD` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x01d1a1cd5955B2feFb167e8bc200A00BfAda8977` (EVault): `$.oracle.name` value mismatch; default `"Unknown"` vs onchain `""`
- `0x038dd0Eb275B7DE3B07884f1Fa106eD6423C45F2` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `3`
- `0x03eed1586a9fDcc328b4Fc4Fbd222fbDd6506A64` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x04713cE12C7AE90e426E3aae2db48CeB26ff89cB` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x056f3a2E41d2778D3a0c0714439c53af2987718E` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `2`
- `0x05755D78caD24417c42960b93D3Bf821a92e4d82` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x0593aAfDc6e0fAa4D423C276cD3549c3953f6270` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x07e32FF47B1056Ce33B5bDB633Dc925fE52eB5E8` (EVault): `$.oracle.name` value mismatch; default `"Unknown"` vs onchain `""`
- `0x07F9A54Dc5135B9878d6745E267625BF0E206840` (EVault): `$.interestRateModel.data` value mismatch; default `null` vs onchain `{"baseRate":{"__type":"bigint","value":"0"},"kink":{"__type":"bigint","value":"3865470566"},"slope1":{"__type":"bigint","value":"516261061"},"slope2":{"__type":"bigint","value":"4371001016"}}`
- `0x09136DAC538B54994170a6905507a74562A80ed3` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `0` vs onchain `1`
- `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069c5544b0000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069c55a270000000000000000000000000000000000000000000000000000000000000078"`
- `0x09FcE883cC16894274802c01e3b9cD90EAE4e43d` (EVault): `$.collaterals[0].oracleAdapters` array length mismatch; default `1` vs onchain `2`
- `0x0Aa836a55c7C3513D15795E7ec23378Ef511BB9f` (EVault): `$.interestRateModel.data` value mismatch; default `null` vs onchain `{"baseRate":{"__type":"bigint","value":"3020253667084197485"},"kink":{"__type":"bigint","value":"3006477107"},"slope1":{"__type":"bigint","value":"3269082165"},"slope2":{"__type":"bigint","value":"24122212156"}}`
- `0x0AE624fFE4103d555e6aC8D4D686ABbAc8D1Ce29` (EVault): `$.interestRateModel.data` value mismatch; default `null` vs onchain `{"baseRate":{"__type":"bigint","value":"0"},"kink":{"__type":"bigint","value":"2147483648"},"slope1":{"__type":"bigint","value":"1406415210"},"slope2":{"__type":"bigint","value":"19050042327"}}`
- `0x0D1B386187be8e96680bbddBf7Bc05FC737f81b8` (EVault): `$.interestRateModel.data` value mismatch; default `null` vs onchain `{"baseRate":{"__type":"bigint","value":"0"},"kink":{"__type":"bigint","value":"1717986918"},"slope1":{"__type":"bigint","value":"829546015"},"slope2":{"__type":"bigint","value":"10514117840"}}`
- `0x0DE3821015518a6179A51d27Bc7ed4a0a3C45b52` (EVault): `$.oracle.name` value mismatch; default `"Unknown"` vs onchain `""`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x7065662E9C0410c6DDc3da66a878070c724D44D4` (EVault)
- `0xADc94A81934Fd5382B21daf0850B835e8415104C` (EVault)

