# SDK vs App Vault Cross-Reference (Onchain Adapters, Mainnet Only)

Generated on 2026-03-25 from `onchain` parity output.


## Coverage summary

### Classic / EVault

- App-visible vaults: `523`
- SDK address matches: `523`
- Missing in SDK `fetchAllVaults`: `0`
- Address matches with >1% field diffs: `155`

Top classic mismatch counts:

- `intrinsicApy`: `139`
- `totalAssetsUsd`: `13`
- `cashUsd`: `12`
- `assetSymbol`: `4`
- `assetDecimals`: `3`
- `borrowApy.base`: `3`
- `shareDecimals`: `3`
- `supplyApy.base`: `3`

Representative classic diffs:

- `0xe01354f8A8fa44E87d96574D1E5Bcd78D61d6EbE` on Ethereum: `intrinsicApy` app `1831.31` vs SDK `null`
- `0xc60400289B32E840909795a063aeccFb093E0b47` on Ethereum: `intrinsicApy` app `779.86483` vs SDK `null`
- `0x1F46186AF85A967416b17380800c69860B7C516F` on Ethereum: `totalAssets` app `2874126968301040095460813` vs SDK `2999445235677226867347454`
- `0x69272D6E8B196247C5263FCdf5c7ED6A70d4e626` on Ethereum: `intrinsicApy` app `11.17132` vs SDK `null`
- `0x178E457b5E614D269D7211d9eaF64030377038fc` on Ethereum: `intrinsicApy` app `11.17132` vs SDK `null`

### Earn

- App-visible vaults: `29`
- SDK address matches: `29`
- Missing in SDK `fetchAllVaults`: `0`
- Address matches with >1% field diffs: `29`

Top earn mismatch counts:

- `guardian`: `29`
- `apyCurrent`: `24`
- `supplyApy.base`: `24`
- `performanceFee`: `22`
- `availableAssetsUsd`: `4`
- `availableAssets`: `3`
- `lostAssets`: `2`
- `owner`: `2`

Representative earn diffs:

- `0xA5cbf5cd429af63EA9989aE1ff4C9d37acFa6767` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0x49C5733d71511A78a3E12925ea832f49031c97e9` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0xd217A07493b6BA272Ff806EE5eaBdFF86C292cc6` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0xb072b2779F1EF1A6A9D2d5fAa1766F341B92aB3a` on Ethereum: `lostAssets` app `0` vs SDK `4`
