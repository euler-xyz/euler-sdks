# SDK vs App Vault Cross-Reference

Generated on 2026-03-25 from `v3` parity output.


## Coverage summary

### Classic / EVault

| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 523 | 0 | 155 |
| BNB Chain | 56 | 61 | 61 | 0 |
| Unichain | 130 | 38 | 38 | 0 |
| Monad | 143 | 63 | 0 | 4 |
| Sonic | 146 | 129 | 0 | 45 |
| TAC | 239 | 26 | 26 | 0 |
| Swell | 1923 | 20 | 20 | 0 |
| Base | 8453 | 101 | 0 | 47 |
| Plasma | 9745 | 121 | 121 | 0 |
| Arbitrum | 42161 | 70 | 70 | 0 |
| Avalanche | 43114 | 197 | 197 | 0 |
| Linea | 59144 | 51 | 51 | 0 |
| BOB | 60808 | 15 | 15 | 0 |
| Berachain | 80094 | 46 | 46 | 0 |

Classic totals:

- App-visible classic vaults: `1461`
- Missing in SDK `fetchAllVaults`: `645`
- Address matches with >1% field diffs: `251`

Top classic mismatch counts:

- `intrinsicApy`: `195`
- `totalAssetsUsd`: `34`
- `cashUsd`: `29`
- `borrowCap`: `14`
- `assetSymbol`: `12`
- `borrowApy.base`: `12`
- `supplyCap`: `11`
- `totalAssets`: `8`

Representative missing classic vaults:

- BNB Chain: `0x7a455f66FD2D2d5C69ae403a971ED513C852F9D7`
- BNB Chain: `0x3ac88AfbC38Bb41443457eeB027b60e85B815538`
- BNB Chain: `0x266D3F3219680624DE4D66c716444512A2B9a72F`
- BNB Chain: `0xc27d44A8aEA0CDa482600136c0d0876e807f6C1a`
- BNB Chain: `0x6078b5dE9d10587cb466ECbBF55C95898AFe99C2`

Representative classic diffs:

- `0xe01354f8A8fa44E87d96574D1E5Bcd78D61d6EbE` on Ethereum: `intrinsicApy` app `1831.31` vs SDK `null`
- `0xc60400289B32E840909795a063aeccFb093E0b47` on Ethereum: `intrinsicApy` app `779.86483` vs SDK `null`
- `0x1F46186AF85A967416b17380800c69860B7C516F` on Ethereum: `totalAssets` app `2874126968301040095460813` vs SDK `2999390240792453970501788`
- `0x69272D6E8B196247C5263FCdf5c7ED6A70d4e626` on Ethereum: `intrinsicApy` app `11.17132` vs SDK `null`
- `0x178E457b5E614D269D7211d9eaF64030377038fc` on Ethereum: `intrinsicApy` app `11.17132` vs SDK `null`

### Earn

| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 29 | 0 | 29 |
| BNB Chain | 56 | 3 | 3 | 0 |
| Unichain | 130 | 1 | 1 | 0 |
| Monad | 143 | 6 | 0 | 6 |
| Sonic | 146 | 2 | 0 | 2 |
| Swell | 1923 | 1 | 1 | 0 |
| Base | 8453 | 14 | 14 | 0 |
| Plasma | 9745 | 19 | 19 | 0 |
| Arbitrum | 42161 | 12 | 12 | 0 |
| Avalanche | 43114 | 13 | 13 | 0 |
| Linea | 59144 | 12 | 12 | 0 |

Earn totals:

- App-visible earn vaults: `112`
- Missing in SDK `fetchAllVaults`: `75`
- Address matches with >1% field diffs: `37`

Top earn mismatch counts:

- `apyCurrent`: `37`
- `guardian`: `37`
- `supplyApy.base`: `37`
- `performanceFee`: `30`
- `availableAssetsUsd`: `5`
- `lostAssets`: `5`
- `strategy.0xB93d4928f39fBcd6C89a7DFbF0A867E6344561bE.allocatedAssets`: `5`
- `availableAssets`: `4`

Representative missing earn vaults:

- BNB Chain: `0xD98b0B1281E06f2f5036B6B1ef1eaAD3304Daa52`
- BNB Chain: `0x27Ec22e4DcB70F7FfE1F6bb89e3284529492c05E`
- BNB Chain: `0x289b5D0E4bB338671c256FC1eb767E30A0c4eE98`
- Unichain: `0x5BD080359114a100bb2Adb105612420F5eB46cBE`
- Swell: `0x4587E75888efe9e9b4EC28470a0660e04FA9b033`

Representative earn diffs:

- `0xA5cbf5cd429af63EA9989aE1ff4C9d37acFa6767` on Ethereum: `name` app `TelosC Surge WBTC` vs SDK `TelosC Earn WBTC`
- `0x49C5733d71511A78a3E12925ea832f49031c97e9` on Ethereum: `name` app `TelosC Surge USDC` vs SDK `Earn USDC`
- `0xd217A07493b6BA272Ff806EE5eaBdFF86C292cc6` on Ethereum: `name` app `TelosC Surge WETH` vs SDK `TelosC Earn WETH`
- `0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0xb072b2779F1EF1A6A9D2d5fAa1766F341B92aB3a` on Ethereum: `lostAssets` app `0` vs SDK `4`
