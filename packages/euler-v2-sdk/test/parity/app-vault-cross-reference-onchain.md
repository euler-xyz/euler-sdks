# SDK vs App Vault Cross-Reference (Onchain Adapters)

Generated on 2026-03-25 from `onchain` parity output.


## Coverage summary

### Classic / EVault

| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 523 | 0 | 155 |
| BNB Chain | 56 | 61 | 0 | 15 |
| Unichain | 130 | 38 | 0 | 26 |
| Monad | 143 | 63 | 0 | 4 |
| Sonic | 146 | 129 | 11 | 36 |
| TAC | 239 | 26 | 0 | 12 |
| Swell | 1923 | 20 | 0 | 14 |
| Base | 8453 | 101 | 9 | 8 |
| Plasma | 9745 | 121 | 82 | 9 |
| Arbitrum | 42161 | 70 | 0 | 19 |
| Avalanche | 43114 | 197 | 0 | 60 |
| Linea | 59144 | 51 | 0 | 22 |
| BOB | 60808 | 15 | 0 | 5 |
| Berachain | 80094 | 46 | 0 | 11 |

Classic totals:

- App-visible classic vaults: `1461`
- Missing in SDK `fetchAllVaults`: `102`
- Address matches with >1% field diffs: `396`

Top classic mismatch counts:

- `intrinsicApy`: `316`
- `totalAssetsUsd`: `72`
- `cashUsd`: `56`
- `totalAssets`: `17`
- `totalBorrowed`: `16`
- `assetSymbol`: `15`
- `totalShares`: `6`
- `assetDecimals`: `3`

Representative missing classic vaults:

- Sonic: `0x196F3C7443E940911EE2Bb88e019Fd71400349D9`
- Sonic: `0xB38D431e932fEa77d1dF0AE0dFE4400c97e597B8`
- Sonic: `0x8d79FBD7694509474198aa52Fd3183dF9ad350A0`
- Sonic: `0x50a2247c60b0e6960d639803CDECC84A0423f733`
- Sonic: `0x7aD07B280A17Ac7af489E487eaAf004b69786a0A`

Representative classic diffs:

- `0xe01354f8A8fa44E87d96574D1E5Bcd78D61d6EbE` on Ethereum: `intrinsicApy` app `1831.31` vs SDK `null`
- `0xc60400289B32E840909795a063aeccFb093E0b47` on Ethereum: `intrinsicApy` app `779.86483` vs SDK `null`
- `0x1F46186AF85A967416b17380800c69860B7C516F` on Ethereum: `totalAssets` app `2874126968301040095460813` vs SDK `2999445235677226867347454`
- `0x69272D6E8B196247C5263FCdf5c7ED6A70d4e626` on Ethereum: `intrinsicApy` app `11.17132` vs SDK `null`
- `0x178E457b5E614D269D7211d9eaF64030377038fc` on Ethereum: `intrinsicApy` app `11.17132` vs SDK `null`

### Earn

| Chain | Chain ID | App vaults | Missing in SDK | Matched address but field diffs |
| --- | ---: | ---: | ---: | ---: |
| Ethereum | 1 | 29 | 0 | 29 |
| BNB Chain | 56 | 3 | 0 | 3 |
| Unichain | 130 | 1 | 0 | 1 |
| Monad | 143 | 6 | 0 | 6 |
| Sonic | 146 | 2 | 0 | 2 |
| Swell | 1923 | 1 | 0 | 1 |
| Base | 8453 | 14 | 0 | 14 |
| Plasma | 9745 | 19 | 0 | 19 |
| Arbitrum | 42161 | 12 | 0 | 12 |
| Avalanche | 43114 | 13 | 0 | 13 |
| Linea | 59144 | 12 | 0 | 12 |

Earn totals:

- App-visible earn vaults: `112`
- Missing in SDK `fetchAllVaults`: `0`
- Address matches with >1% field diffs: `112`

Top earn mismatch counts:

- `guardian`: `112`
- `apyCurrent`: `99`
- `supplyApy.base`: `99`
- `performanceFee`: `84`
- `availableAssetsUsd`: `19`
- `lostAssets`: `19`
- `availableAssets`: `12`
- `totalAssetsUsd`: `9`

Representative missing earn vaults:

- none

Representative earn diffs:

- `0xA5cbf5cd429af63EA9989aE1ff4C9d37acFa6767` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0x49C5733d71511A78a3E12925ea832f49031c97e9` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0xd217A07493b6BA272Ff806EE5eaBdFF86C292cc6` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0x2B47c128b35DDDcB66Ce2FA5B33c95314a7de245` on Ethereum: `performanceFee` app `0` vs SDK `null`
- `0xb072b2779F1EF1A6A9D2d5fAa1766F341B92aB3a` on Ethereum: `lostAssets` app `0` vs SDK `4`


## Comparison to V3

- Classic missing vaults: `645` -> `102`
- Earn missing vaults: `75` -> `0`
- Classic diff vaults: `251` -> `396`
- Earn diff vaults: `37` -> `112`
