# Services

This SDK exposes multiple services. The main entry points are:

- `accountService`
- `portfolioService`
- `vaultMetaService`
- `executionService`
- `swapService`

Some services below are lower-level building blocks and usually do not need to be called directly, because they are already used by top-level services.

## Top-Level Entry Points

- `accountService`: Fetches the lower-level, contract-shaped account view: sub-accounts, raw positions, collateral/debt, liquidity, and optional vault/entity population.
- `portfolioService`: Fetches the same underlying data as an opinionated, position-first savings/borrows view. It always enables vault and market-price population.
- `vaultMetaService`: Type-agnostic vault access. Routes vault addresses to the right vault service (`EVault`, `EulerEarn`, `Securitize`) and returns the correct entity type.
- `executionService`: Builds, simulates, estimates gas for, and executes transaction plans for core actions (deposit, withdraw, borrow, repay, swap-based operations, liquidation, debt operations).
- `swapService`: Fetches swap quotes and routes for asset exchange flows.

## Vault-Specific Services

- `eVaultService`: EVault-specific reads and enrichment (interest rates, collaterals, optional prices/rewards/labels).
- `eulerEarnService`: Euler Earn-specific reads and enrichment (strategies, adapter-provided 1h supply APY, optional prices/rewards/labels).
- `securitizeVaultService`: Securitize collateral vault-specific reads and enrichment.

These are often used indirectly through `vaultMetaService`, which handles vault type detection and routing.

All fetch-option types support `populateAll?: boolean`. When `true`, the service enables all supported populate/enrichment steps and overrides granular `populateX` flags.

## Supporting and Infrastructure Services

- `walletService`: Fetches wallet balances and allowances.
- `priceService`: Resolves market prices used for valuation and computed account metrics.
- `oracleAdapterService`: Fetches oracle adapter metadata/checks (provider, methodology, checks) from the oracle checks dataset and builds address-keyed maps for UI/tooling.
- `rewardsService`: Fetches reward campaign data used to populate vault/account rewards and builds provider-specific reward claim plans.
  See: [`rewards-service.md`](./rewards-service.md)
- `feeFlowService`: Fetches FeeFlow state, filters eligible vaults, and builds FeeFlow buy plans.
  See: [`fee-flow-service.md`](./fee-flow-service.md)
- `intrinsicApyService`: Fetches intrinsic APY data used by vault enrichments.
- `tokenlistService`: Provides token metadata/list data.
- `eulerLabelsService`: Provides human-readable labels and metadata for protocol entities.
- `providerService`: Manages per-chain RPC providers.
- `deploymentService`: Provides chain-specific deployed addresses/configuration.
- `abiService`: Provides ABI access used for contract encoding/decoding.

## Service Capability Matrix

| Service | Fetch Vaults | Market Prices | Rewards | Intrinsic APY | Labels | Notes |
|---|---|---|---|---|---|---|
| `vaultMetaService` | Yes (type-routed) | Via forwarded options | Via forwarded options | Via forwarded options | Via forwarded options | Supports `fetchAllVaults()` across all registered vault services; batch methods may return `undefined` entries |
| `eVaultService` | Yes (`EVault`) | Yes (`populateMarketPrices`) | Yes (`populateRewards`) | Yes (`populateIntrinsicApy`) | Yes (`populateLabels`) | Also supports `populateCollaterals` and `fetchAllVaults()`; batch methods may return `undefined` entries |
| `eulerEarnService` | Yes (`EulerEarn`) | Yes (`populateMarketPrices`) | Yes (`populateRewards`) | Yes (`populateIntrinsicApy`) | Yes (`populateLabels`) | Also supports `populateStrategyVaults` and `fetchAllVaults()`; batch methods may return `undefined` entries |
| `securitizeVaultService` | Yes (`SecuritizeCollateralVault`) | Yes (`populateMarketPrices`) | Yes (`populateRewards`) | Yes (`populateIntrinsicApy`) | Yes (`populateLabels`) | No standard perspectives for verified-vault discovery; `fetchAllVaults()` currently depends on adapter discovery support |
| `accountService` | Account/sub-account data | Yes (`populateMarketPrices`) | Yes (`populateUserRewards`) | Via `vaultFetchOptions` | Via `vaultFetchOptions` | Vault enrichment goes through `vaultMetaService` |
| `portfolioService` | Account-derived portfolio data | Yes (`populateAll`) | Yes (`populateAll`) | Yes (`populateAll`) | Yes (`populateAll`) | Fetches the backing account with `populateAll: true`; see [`portfolio.md`](./portfolio.md) |
| `executionService` | Simulates plans | Can populate simulated results | Can populate simulated results | Can populate simulated results | Can populate simulated results | Produces transaction plans/EVC batch payloads, resolves approvals, executes plans, and estimates gas |
| `swapService` | No (quotes only) | No | No | No | No | Returns swap quotes/providers for execution plans |
| `oracleAdapterService` | No | No | No | No | No | Oracle adapter metadata API (`fetchOracleAdapters`, `fetchOracleAdapterMap`, `enrichAdapters`) |

See also: [`execution-service.md`](./execution-service.md).
