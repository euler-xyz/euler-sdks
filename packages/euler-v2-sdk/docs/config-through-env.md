# Config Through Env

The SDK reads `EULER_SDK_*` environment variables at `buildEulerSDK()` time. The matching `config` prop field has the same meaning and always has higher priority.

Resolution order for built-in scalar config is:

1. `buildEulerSDK({ config: ... })`
2. Explicit SDK options such as `pricingServiceConfig` or nested service configs, when a matching option exists
3. `EULER_SDK_*` environment variables
4. SDK defaults

RPC URLs use `config.rpcUrls` or `EULER_SDK_RPC_URL_<chainId>`.

## Core

| Config field | Environment variable | Default |
|---|---|---|
| `rpcUrls[chainId]` | `EULER_SDK_RPC_URL_<chainId>` | none |
| `v3ApiUrl` | `EULER_SDK_V3_API_URL` | `https://v3.eul.dev` |
| `v3ApiKey` | `EULER_SDK_V3_API_KEY` | none |
| `queryCacheEnabled` | `EULER_SDK_QUERY_CACHE_ENABLED` | `true` |
| `queryCacheTtlMs` | `EULER_SDK_QUERY_CACHE_TTL_MS` | `5000` |

## Account Service

| Config field | Environment variable | Default |
|---|---|---|
| `accountServiceAdapter` | `EULER_SDK_ACCOUNT_SERVICE_ADAPTER` | `v3` |
| `accountV3ApiUrl` | `EULER_SDK_ACCOUNT_V3_API_URL` | `v3ApiUrl` |
| `accountV3ApiKey` | `EULER_SDK_ACCOUNT_V3_API_KEY` | `v3ApiKey` |
| `accountV3ForceFresh` | `EULER_SDK_ACCOUNT_V3_FORCE_FRESH` | adapter default |
| `accountVaultsSubgraphUrls[chainId]` | `EULER_SDK_ACCOUNT_VAULTS_SUBGRAPH_URL_<chainId>` | built-in Goldsky subgraphs |

## Vault Services

| Config field | Environment variable | Default |
|---|---|---|
| `eVaultServiceAdapter` | `EULER_SDK_EVAULT_SERVICE_ADAPTER` | `v3` |
| `eVaultV3ApiUrl` | `EULER_SDK_EVAULT_V3_API_URL` | `v3ApiUrl` |
| `eVaultV3ApiKey` | `EULER_SDK_EVAULT_V3_API_KEY` | `v3ApiKey` |
| `eVaultV3BatchSize` | `EULER_SDK_EVAULT_V3_BATCH_SIZE` | adapter default |
| `eulerEarnServiceAdapter` | `EULER_SDK_EULER_EARN_SERVICE_ADAPTER` | `v3` |
| `eulerEarnV3ApiUrl` | `EULER_SDK_EULER_EARN_V3_API_URL` | `v3ApiUrl` |
| `eulerEarnV3ApiKey` | `EULER_SDK_EULER_EARN_V3_API_KEY` | `v3ApiKey` |
| `vaultTypeAdapter` | `EULER_SDK_VAULT_TYPE_ADAPTER` | `v3` |
| `vaultTypeV3ApiUrl` | `EULER_SDK_VAULT_TYPE_V3_API_URL` | `v3ApiUrl` |
| `vaultTypeV3ApiKey` | `EULER_SDK_VAULT_TYPE_V3_API_KEY` | `v3ApiKey` |
| `vaultTypeV3TypeMap` | `EULER_SDK_VAULT_TYPE_V3_TYPE_MAP_JSON` | adapter default map |
| `vaultTypeSubgraphUrls[chainId]` | `EULER_SDK_VAULT_TYPE_SUBGRAPH_URL_<chainId>` | built-in Goldsky subgraphs |

`EULER_SDK_VAULT_TYPE_V3_TYPE_MAP_JSON` is a JSON object with string values, for example `{"custom":"EVault"}`.

## Pricing, Swaps, And Deployments

| Config field | Environment variable | Default |
|---|---|---|
| `pricingApiUrl` | `EULER_SDK_PRICING_API_URL` | `v3ApiUrl` |
| `pricingApiKey` | `EULER_SDK_PRICING_API_KEY` | `v3ApiKey` |
| `swapApiUrl` | `EULER_SDK_SWAP_API_URL` | `https://swap.euler.finance` |
| `swapDefaultDeadline` | `EULER_SDK_SWAP_DEFAULT_DEADLINE` | `1800` |
| `deploymentsUrl` | `EULER_SDK_DEPLOYMENTS_URL` | Euler interfaces `EulerChains.json` |

## Rewards

| Config field | Environment variable | Default |
|---|---|---|
| `rewardsServiceAdapter` | `EULER_SDK_REWARDS_SERVICE_ADAPTER` | `v3` |
| `rewardsV3ApiUrl` | `EULER_SDK_REWARDS_V3_API_URL` | `v3ApiUrl` |
| `rewardsV3ApiKey` | `EULER_SDK_REWARDS_V3_API_KEY` | `v3ApiKey` |
| `rewardsMerklApiUrl` | `EULER_SDK_REWARDS_MERKL_API_URL` | Merkl API |
| `rewardsBrevisApiUrl` | `EULER_SDK_REWARDS_BREVIS_API_URL` | Brevis campaigns API |
| `rewardsBrevisProofsApiUrl` | `EULER_SDK_REWARDS_BREVIS_PROOFS_API_URL` | Brevis proofs API |
| `rewardsFuulApiUrl` | `EULER_SDK_REWARDS_FUUL_API_URL` | Fuul incentives API |
| `rewardsFuulTotalsUrl` | `EULER_SDK_REWARDS_FUUL_TOTALS_URL` | none |
| `rewardsFuulClaimChecksUrl` | `EULER_SDK_REWARDS_FUUL_CLAIM_CHECKS_URL` | none |
| `rewardsBrevisChainIds` | `EULER_SDK_REWARDS_BREVIS_CHAIN_IDS` | `1` |
| `rewardsMerklDistributorAddress` | `EULER_SDK_REWARDS_MERKL_DISTRIBUTOR_ADDRESS` | Merkl distributor |
| `rewardsFuulManagerAddress` | `EULER_SDK_REWARDS_FUUL_MANAGER_ADDRESS` | Fuul manager |
| `rewardsFuulFactoryAddress` | `EULER_SDK_REWARDS_FUUL_FACTORY_ADDRESS` | Fuul factory |
| `rewardsEnableMerkl` | `EULER_SDK_REWARDS_ENABLE_MERKL` | `true` |
| `rewardsEnableBrevis` | `EULER_SDK_REWARDS_ENABLE_BREVIS` | `true` |
| `rewardsEnableFuul` | `EULER_SDK_REWARDS_ENABLE_FUUL` | `true` |

`EULER_SDK_REWARDS_BREVIS_CHAIN_IDS` is a comma-separated list, for example `1,8453`.

## Intrinsic APY

| Config field | Environment variable | Default |
|---|---|---|
| `intrinsicApyV3ApiUrl` | `EULER_SDK_INTRINSIC_APY_V3_API_URL` | `v3ApiUrl` |
| `intrinsicApyV3ApiKey` | `EULER_SDK_INTRINSIC_APY_V3_API_KEY` | `v3ApiKey` |
| `intrinsicApyV3PageSize` | `EULER_SDK_INTRINSIC_APY_V3_PAGE_SIZE` | adapter default |
| `intrinsicApyV3MaxAssetsPerRequest` | `EULER_SDK_INTRINSIC_APY_V3_MAX_ASSETS_PER_REQUEST` | adapter default |

## Euler Labels

| Config field | Environment variable | Default |
|---|---|---|
| `eulerLabelsBaseUrl` | `EULER_SDK_EULER_LABELS_BASE_URL` | Euler labels GitHub raw base |
| `eulerLabelsEntitiesUrlTemplate` | `EULER_SDK_EULER_LABELS_ENTITIES_URL_TEMPLATE` | `{base}/{chainId}/entities.json` |
| `eulerLabelsProductsUrlTemplate` | `EULER_SDK_EULER_LABELS_PRODUCTS_URL_TEMPLATE` | `{base}/{chainId}/products.json` |
| `eulerLabelsPointsUrlTemplate` | `EULER_SDK_EULER_LABELS_POINTS_URL_TEMPLATE` | `{base}/{chainId}/points.json` |
| `eulerLabelsEarnVaultsUrlTemplate` | `EULER_SDK_EULER_LABELS_EARN_VAULTS_URL_TEMPLATE` | `{base}/{chainId}/earn-vaults.json` |
| `eulerLabelsAssetsUrlTemplate` | `EULER_SDK_EULER_LABELS_ASSETS_URL_TEMPLATE` | `{base}/{chainId}/assets.json` |
| `eulerLabelsGlobalAssetsUrl` | `EULER_SDK_EULER_LABELS_GLOBAL_ASSETS_URL` | `{base}/all/assets.json` |
| `eulerLabelsLogoUrlTemplate` | `EULER_SDK_EULER_LABELS_LOGO_URL_TEMPLATE` | `{base}/logo/{filename}` |

Template variables are `{base}`, `{chainId}`, and `{filename}`.

## Token Lists And Oracle Metadata

| Config field | Environment variable | Default |
|---|---|---|
| `tokenlistApiBaseUrl` | `EULER_SDK_TOKENLIST_API_BASE_URL` | `https://indexer.euler.finance` |
| `tokenlistUrlTemplate` | `EULER_SDK_TOKENLIST_URL_TEMPLATE` | `{base}/v1/tokens?chainId={chainId}` |
| `oracleAdaptersBaseUrl` | `EULER_SDK_ORACLE_ADAPTERS_BASE_URL` | `https://oracle-checks-data.euler.finance` |
| `oracleAdaptersCacheMs` | `EULER_SDK_ORACLE_ADAPTERS_CACHE_MS` | `600000` |

## Fee Flow

| Config field | Environment variable | Default |
|---|---|---|
| `feeFlowControllerAddress` | `EULER_SDK_FEE_FLOW_CONTROLLER_ADDRESS` | deployment config |
| `feeFlowControllerUtilAddress` | `EULER_SDK_FEE_FLOW_CONTROLLER_UTIL_ADDRESS` | deployment config |
| `feeFlowDefaultBuyDeadlineSeconds` | `EULER_SDK_FEE_FLOW_DEFAULT_BUY_DEADLINE_SECONDS` | service default |

## Parsing

Booleans accept `true`, `false`, `1`, `0`, `yes`, `no`, `on`, and `off`. Number fields must be finite numbers. Invalid enum, number, boolean, or JSON values throw during `buildEulerSDK()` so misconfiguration is visible at startup.
