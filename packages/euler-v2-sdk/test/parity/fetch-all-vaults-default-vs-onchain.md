# fetchAllVaults default (V3) vs explicit onchain

Generated on 2026-04-03T12:03:39.826Z.

## Totals

- Chains compared: `1`
- Default (V3) vaults: `818`
- Onchain vaults: `816`
- Matched vaults: `686`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `130`
- Default errors: `1109`
- Onchain errors: `927`

## Top diff paths

- `$.collaterals[@0x797dd80692c3b2dadabce8e30c07fde5307d48a9].vault.fees.accumulatedFeesAssets`: `65`
- `$.collaterals[@0x797dd80692c3b2dadabce8e30c07fde5307d48a9].vault.fees.accumulatedFeesShares`: `65`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets`: `58`
- `$.fees.accumulatedFeesAssets`: `25`
- `$.fees.accumulatedFeesShares`: `24`
- `$.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].vault.fees.accumulatedFeesAssets`: `12`
- `$.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].vault.fees.accumulatedFeesShares`: `12`
- `$.collaterals[@0xe846ca062ab869b66ae8dcd811973f628ba82eaf].vault.fees.accumulatedFeesAssets`: `12`
- `$.collaterals[@0xe846ca062ab869b66ae8dcd811973f628ba82eaf].vault.fees.accumulatedFeesShares`: `12`
- `$.totalShares`: `12`

## Chain 1

- Default (V3) vaults: `818`
- Onchain vaults: `816`
- Matched vaults: `686`
- Missing in default: `0`
- Missing in onchain: `2`
- Vaults with diffs: `130`
- Default errors: `1109`
- Onchain errors: `927`

Top diff paths:

- `$.collaterals[@0x797dd80692c3b2dadabce8e30c07fde5307d48a9].vault.fees.accumulatedFeesAssets`: `65`
- `$.collaterals[@0x797dd80692c3b2dadabce8e30c07fde5307d48a9].vault.fees.accumulatedFeesShares`: `65`
- `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets`: `58`
- `$.fees.accumulatedFeesAssets`: `25`
- `$.fees.accumulatedFeesShares`: `24`
- `$.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].vault.fees.accumulatedFeesAssets`: `12`
- `$.collaterals[@0xbc4b4ac47582c3e38ce5940b80da65401f4628f1].vault.fees.accumulatedFeesShares`: `12`
- `$.collaterals[@0xe846ca062ab869b66ae8dcd811973f628ba82eaf].vault.fees.accumulatedFeesAssets`: `12`
- `$.collaterals[@0xe846ca062ab869b66ae8dcd811973f628ba82eaf].vault.fees.accumulatedFeesShares`: `12`
- `$.totalShares`: `12`

Representative diff vaults:

- root `0x056f3a2E41d2778D3a0c0714439c53af2987718E` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`
- root `0x0685191dFd11E09fD23C01C54d32b84c4D18ed77` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000d6080000000000000000000000000000000000000000000000000000000000001c20"` vs onchain `"0xa6e68d63000000000000000000000000000000000000000000000000000000000000e4c00000000000000000000000000000000000000000000000000000000000001c20"`
- root `0x09136DAC538B54994170a6905507a74562A80ed3` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`
- root `0x09C47745Db8c6e84e2B2be476219D5D9eFfAE3cA` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cf9d5b0000000000000000000000000000000000000000000000000000000000000078"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000069cfac8b0000000000000000000000000000000000000000000000000000000000000078"`
- root `0x09FcE883cC16894274802c01e3b9cD90EAE4e43d` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`
- root `0x10e0B2B42874ADF8c29D5F900c0D18b61f048ffb` (EVault); issue vault `0x33e97864E44631e6d31b81051DAABcD4C31bF792`: `$.collaterals[@0x879aec0aae98ac89598ae8f765eb9a9ee307d16f].vault.collaterals[@0x33e97864e44631e6d31b81051daabcd4c31bf792].oraclePriceRaw.amountOutAsk` bigint values differ by more than 1%; default `{"__type":"bigint","value":"2059082943010000000000"}` vs onchain `{"__type":"bigint","value":"0"}`
- root `0x122e9eA082D8c060Bb1a3476aa18B9E739fBbAAf` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`
- root `0x14e314d5d53fd7Ad21d7d40046DfD98f183d22F1` (EVault): `$.collaterals` array length mismatch; default `0` vs onchain `1`
- root `0x15A60a5300c1D9179d4c0e2B49bac6146794Ae1F` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`
- root `0x1924D7fab80d0623f0836Cbf5258a7fa734EE9D9` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`
- root `0x1ab9e92CFdE84f38868753d30fFc43F812B803C5` (EVault); issue vault `0xc364FD9637fe562A2d5a1cbc7d1Ab7F32bE900ef`: `$.collaterals[@0xc364fd9637fe562a2d5a1cbc7d1ab7f32be900ef].oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c74f000000000000000000000000000000000000000000000000000000000000015180"` vs onchain `"0xa6e68d630000000000000000000000000000000000000000000000000000000000c75c980000000000000000000000000000000000000000000000000000000000015180"`
- root `0x20622fcD4476fbc9d5Ef36EBd371307a56d9028c` (EVault); issue vault `0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6`: `$.collaterals[@0x2daca71cb58285212dc05d65cfd4f59a82bc4cf6].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"45213711008241111"}` vs onchain `{"__type":"bigint","value":"72010426282546394"}`
- root `0x22cC732cbca457F6811295bCE75B01822544bA52` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`
- root `0x23273F305eFeecb679c64B18EceCBE9553cf657f` (EulerEarn); issue vault `0xba98fC35C9dfd69178AD5dcE9FA29c64554783b5`: `$.strategies[@0xab2726daf820aa9270d14db9b18c8d187cbf2f30].vault.collaterals[@0xba98fc35c9dfd69178ad5dce9fa29c64554783b5].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"102999242"}` vs onchain `{"__type":"bigint","value":"162786440"}`
- root `0x283aC2b5f5c830E8a7Aac4ED160c47fA29F5CcC1` (EulerEarn): `$.totalShares` bigint values differ by more than 1%; default `{"__type":"bigint","value":"0"}` vs onchain `{"__type":"bigint","value":"1811133098632478921765"}`
- root `0x29412Fe8d85DF60cb95Cb6d509742EcBFE4605A3` (EulerEarn); issue vault `0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30`: `$.strategies[@0xba98fc35c9dfd69178ad5dce9fa29c64554783b5].vault.collaterals[@0xab2726daf820aa9270d14db9b18c8d187cbf2f30].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"127766058"}` vs onchain `{"__type":"bigint","value":"199635122"}`
- root `0x29B688A9E9dCe9abb28d46ab2e3Fb3c3F4EeFa90` (EVault): `$.oraclePriceRaw.queryFailureReason` value mismatch; default `"0xa6e68d630000000000000000000000000000000000000000000000000000000000419880000000000000000000000000000000000000000000000000000000000000afc8"` vs onchain `"0xa6e68d63000000000000000000000000000000000000000000000000000000000041a66c000000000000000000000000000000000000000000000000000000000000afc8"`
- root `0x2a356443FeE07703266066c6Bb1B11b82d8246AD` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`
- root `0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245` (EulerEarn); issue vault `0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2`: `$.strategies[@0x9bd52f2805c6af014132874124686e7b248c2cbb].vault.collaterals[@0xaf5372792a29dc6b296d6ffd4aa3386aff8f9bb2].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"74191633551305035820"}` vs onchain `{"__type":"bigint","value":"118162459599214821659"}`
- root `0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6` (EVault); issue vault `0x313603FA690301b0CaeEf8069c065862f9162162`: `$.collaterals[@0x313603fa690301b0caeef8069c065862f9162162].vault.fees.accumulatedFeesAssets` bigint values differ by more than 2%; default `{"__type":"bigint","value":"657640"}` vs onchain `{"__type":"bigint","value":"1080788"}`

Representative vaults missing in default:

- none

Representative vaults missing in onchain:

- `0x7065662E9C0410c6DDc3da66a878070c724D44D4` (EVault)
- `0xADc94A81934Fd5382B21daf0850B835e8415104C` (EVault)

