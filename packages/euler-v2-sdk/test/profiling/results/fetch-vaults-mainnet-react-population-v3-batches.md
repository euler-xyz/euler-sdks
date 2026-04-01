# fetchVaults Mainnet V3 Batch Size Benchmark

- Generated at: 2026-04-01T14:44:14.294Z
- Chain ID: 1
- V3 endpoint: https://v3staging.eul.dev
- Address source: eulerLabelsService.fetchEulerLabelsProducts(1)
- Vault count: 284
- Iterations per batch size: 20
- Population options: populateMarketPrices, populateRewards, populateIntrinsicApy, populateLabels

| Batch size | Avg ms | Median ms | P95 ms | Min ms | Max ms | Warnings | Errors |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 355.45 | 166.93 | 957.05 | 162 | 2386.02 | 5516 | 81 |
| 50 | 167.41 | 163.44 | 189.85 | 160.12 | 207.92 | 5680 | 0 |
| 100 | 166.12 | 163.84 | 172.05 | 160.33 | 192.45 | 5680 | 0 |
| 200 | 165.58 | 165.56 | 173.76 | 157.14 | 174.96 | 5680 | 0 |
| 500 | 183.16 | 171.76 | 182.64 | 165.57 | 389.58 | 5680 | 0 |
