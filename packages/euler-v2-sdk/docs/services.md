# Services

This SDK exposes multiple services. In most applications, the top-level entry points should be:

- `accountService`
- `vaultMetaService`
- `executionService`
- `swapService`

Some services below are lower-level building blocks and usually do not need to be called directly, because they are already used by top-level services.

## Top-Level Entry Points

- `accountService`: Fetches account and sub-account state (positions, collateral/debt, liquidity), with optional vault/entity population.
- `vaultMetaService`: Type-agnostic vault access. Routes vault addresses to the right vault service (`EVault`, `EulerEarn`, `Securitize`) and returns the correct entity type.
- `executionService`: Builds transaction plans for core actions (deposit, withdraw, borrow, repay, swap-based operations, liquidation, debt operations).
- `swapService`: Fetches swap quotes and routes for asset exchange flows.

## Vault-Specific Services

- `eVaultService`: EVault-specific reads and enrichment (interest rates, collaterals, optional prices/rewards/labels).
- `eulerEarnService`: Euler Earn-specific reads and enrichment (strategies, APY, optional prices/rewards/labels).
- `securitizeVaultService`: Securitize collateral vault-specific reads and enrichment.

These are often used indirectly through `vaultMetaService`, which handles vault type detection and routing.

All fetch-option types support `populateAll?: boolean`. When `true`, the service enables all supported populate/enrichment steps and overrides granular `populateX` flags.

## Supporting and Infrastructure Services

- `walletService`: Fetches wallet balances and allowances.
- `simulationService`: Simulates account state/results for planned operations (including state-override flows).
- `priceService`: Resolves market prices used for valuation and computed account metrics.
- `oracleAdapterService`: Fetches oracle adapter metadata/checks (provider, methodology, checks) from the oracle checks dataset and builds address-keyed maps for UI/tooling.
- `rewardsService`: Fetches reward campaign data used to populate vault/account rewards.
- `intrinsicApyService`: Fetches intrinsic APY data used by vault enrichments.
- `tokenlistService`: Provides token metadata/list data.
- `eulerLabelsService`: Provides human-readable labels and metadata for protocol entities.
- `providerService`: Manages per-chain RPC providers.
- `deploymentService`: Provides chain-specific deployed addresses/configuration.
- `abiService`: Provides ABI access used for contract encoding/decoding.

## Service Capability Matrix

| Service | Fetch Vaults | Market Prices | Rewards | Intrinsic APY | Labels | Notes |
|---|---|---|---|---|---|---|
| `vaultMetaService` | Yes (type-routed) | Via forwarded options | Via forwarded options | Via forwarded options | Via forwarded options | Batch methods preserve input order and may return `undefined` entries for per-vault failures; check `errors` |
| `eVaultService` | Yes (`EVault`) | Yes (`populateMarketPrices`) | Yes (`populateRewards`) | Yes (`populateIntrinsicApy`) | Yes (`populateLabels`) | Also supports `populateCollaterals`; batch methods may return `undefined` entries |
| `eulerEarnService` | Yes (`EulerEarn`) | Yes (`populateMarketPrices`) | Yes (`populateRewards`) | Yes (`populateIntrinsicApy`) | Yes (`populateLabels`) | Also supports `populateStrategyVaults`; batch methods may return `undefined` entries |
| `securitizeVaultService` | Yes (`SecuritizeCollateralVault`) | Yes (`populateMarketPrices`) | Yes (`populateRewards`) | Yes (`populateIntrinsicApy`) | Yes (`populateLabels`) | No standard perspectives for verified-vault discovery; batch methods may return `undefined` entries |
| `accountService` | Account/sub-account data | Yes (`populateMarketPrices`) | Yes (`populateUserRewards`) | Via `vaultFetchOptions` | Via `vaultFetchOptions` | Vault enrichment goes through `vaultMetaService` |
| `executionService` | No (planning/encoding only) | No | No | No | No | Produces transaction plans and batch payloads |
| `swapService` | No (quotes only) | No | No | No | No | Returns swap quotes/providers for execution plans |
| `simulationService` | Simulates plans | Can populate in results | Can populate in results | Can populate in results | Can populate in results | Uses `accountFetchOptions` / `vaultFetchOptions` |
| `oracleAdapterService` | No | No | No | No | No | Oracle adapter metadata API (`getOracleAdapters`, `getOracleAdapterMap`, `enrichAdapters`) |
