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
| `v3ApiUrl` | `EULER_SDK_V3_API_URL` | `https://v3.euler.finance` |
| `v3ApiKey` | `EULER_SDK_V3_API_KEY` | none |
| `queryCacheEnabled` | `EULER_SDK_QUERY_CACHE_ENABLED` | `true` |
| `queryCacheTtlMs` | `EULER_SDK_QUERY_CACHE_TTL_MS` | `5000` |

## Activity

| Config field | Environment variable | Default |
|---|---|---|
| `activityV3ApiUrl` | `EULER_SDK_ACTIVITY_V3_API_URL` | `v3ApiUrl` |
| `activityV3ApiKey` | `EULER_SDK_ACTIVITY_V3_API_KEY` | `v3ApiKey` |

The activity-specific values configure the normalized account and vault event
endpoints without changing the V3 configuration used by other SDK services.

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

## Pricing, Swaps, And Euler Interfaces

| Config field | Environment variable | Default |
|---|---|---|
| `pricingApiUrl` | `EULER_SDK_PRICING_API_URL` | `v3ApiUrl` |
| `pricingApiKey` | `EULER_SDK_PRICING_API_KEY` | `v3ApiKey` |
| `swapApiUrl` | `EULER_SDK_SWAP_API_URL` | `https://swap.euler.finance` |
| `swapDefaultDeadline` | `EULER_SDK_SWAP_DEFAULT_DEADLINE` | `1800` |
| `eulerInterfacesBranch` | `EULER_SDK_EULER_INTERFACES_BRANCH` | `master` |
| `deploymentsUrl` | `EULER_SDK_DEPLOYMENTS_URL` | `EulerChains.json` from `eulerInterfacesBranch` |

`eulerInterfacesBranch` keeps the runtime ABI service and the default
deployments document on the same `euler-interfaces` branch. A direct
`deploymentsUrl` remains available for custom mirrors and takes precedence for
the deployment service without changing the ABI branch.

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
| `rewardsTurtleApiUrl` | `EULER_SDK_REWARDS_TURTLE_API_URL` | Turtle Earn API v2 (`https://earn.turtle.xyz/v2`) |
| `rewardsTurtleApiKey` | `EULER_SDK_REWARDS_TURTLE_API_KEY` | none |
| `rewardsFuulTotalsUrl` | `EULER_SDK_REWARDS_FUUL_TOTALS_URL` | none |
| `rewardsFuulClaimChecksUrl` | `EULER_SDK_REWARDS_FUUL_CLAIM_CHECKS_URL` | none |
| `rewardsBrevisChainIds` | `EULER_SDK_REWARDS_BREVIS_CHAIN_IDS` | all chains |
| `rewardsMerklDistributorAddress` | `EULER_SDK_REWARDS_MERKL_DISTRIBUTOR_ADDRESS` | Merkl distributor |
| `rewardsFuulManagerAddress` | `EULER_SDK_REWARDS_FUUL_MANAGER_ADDRESS` | Fuul manager |
| `rewardsFuulFactoryAddress` | `EULER_SDK_REWARDS_FUUL_FACTORY_ADDRESS` | Fuul factory |
| `rewardsTurtleStreams` | `EULER_SDK_REWARDS_TURTLE_STREAMS_JSON` | none |
| `rewardsEnableMerkl` | `EULER_SDK_REWARDS_ENABLE_MERKL` | `true` |
| `rewardsEnableBrevis` | `EULER_SDK_REWARDS_ENABLE_BREVIS` | `true` |
| `rewardsEnableFuul` | `EULER_SDK_REWARDS_ENABLE_FUUL` | `true` |
| `rewardsEnableTurtle` | `EULER_SDK_REWARDS_ENABLE_TURTLE` | `true` |

`EULER_SDK_REWARDS_BREVIS_CHAIN_IDS` is a comma-separated list, for example `1,8453`.

`EULER_SDK_REWARDS_TURTLE_STREAMS_JSON` is a JSON array of `{ streamId, chainId, streamAddress?, rewardToken?, tokenPrice? }` objects.

`rewardsTurtleApiUrl` is the Turtle Earn `/v2` base. The direct adapter reads `GET {url}/streams/` for campaign discovery and `GET {url}/streams/merkle_proofs?wallet=…&streamIds=…` for proofs, with one `streamIds` parameter per stream. Turtle removed `/v1` in October 2026 (every `/v1` path answers 404), so an override or proxy must serve these `/v2` paths and pass repeated `streamIds` through unchanged.

The Turtle Earn API requires an API key on every endpoint. The direct rewards adapter sends `rewardsTurtleApiKey` as an `X-API-Key` header on its Turtle stream and proof requests; without it those requests are rejected and resolve to no Turtle campaigns or user rewards. The key is a server-side secret. Unlike the other variables in this table, `VITE_EULER_SDK_REWARDS_TURTLE_API_KEY` is ignored, so it cannot be injected into browser bundles; do not expose it through any other browser env injection either. Credentialed requests do not follow redirects, so the key is only ever sent to the `rewardsTurtleApiUrl` origin. Browser builds should either point `rewardsTurtleApiUrl` at a server-side proxy that adds the header, or set `rewardsEnableTurtle` to `false` and rely on the V3 rewards adapter. Disabling Turtle stops campaign discovery only; explicit Turtle claim proofs are still fetched through the direct adapter in every mode, so a browser app offering Turtle claims still needs the proxy URL.

## Intrinsic APY

| Config field | Environment variable | Default |
|---|---|---|
| `intrinsicApyV3ApiUrl` | `EULER_SDK_INTRINSIC_APY_V3_API_URL` | `v3ApiUrl` |
| `intrinsicApyV3ApiKey` | `EULER_SDK_INTRINSIC_APY_V3_API_KEY` | `v3ApiKey` |
| `intrinsicApyV3PageSize` | `EULER_SDK_INTRINSIC_APY_V3_PAGE_SIZE` | adapter default |
| `intrinsicApyV3MaxAssetsPerRequest` | `EULER_SDK_INTRINSIC_APY_V3_MAX_ASSETS_PER_REQUEST` | adapter default |

## Euler Labels

Labels use the shared `v3ApiUrl` / `v3ApiKey` settings and query cache. Use `eulerLabelsV3AdapterConfig` for V3 dataset/version or request customization. Applications that own a different labels flow inject `servicesOverrides.eulerLabelsService`; the SDK has no file URL configuration or file-fetching adapter. See [Custom labels flows](./labels.md#custom-labels-flows).

## Token Lists And Oracle Metadata

| Config field | Environment variable | Default |
|---|---|---|
| `tokenlistApiBaseUrl` | `EULER_SDK_TOKENLIST_API_BASE_URL` | `https://v3.euler.finance` |
| `tokenlistUrlTemplate` | `EULER_SDK_TOKENLIST_URL_TEMPLATE` | `{base}/v3/tokens?chainId={chainId}&limit=500&type=base` |
| `oracleAdapterV3ApiUrl` | `EULER_SDK_ORACLE_ADAPTER_V3_API_URL` | Shared V3 URL (`https://v3.euler.finance`) |
| `oracleAdapterV3ApiKey` | `EULER_SDK_ORACLE_ADAPTER_V3_API_KEY` | Shared V3 API key when configured |
| `oracleAdapterV3PageSize` | `EULER_SDK_ORACLE_ADAPTER_V3_PAGE_SIZE` | `100` |
| `oracleAdapterV3CacheMs` | `EULER_SDK_ORACLE_ADAPTER_V3_CACHE_MS` | `300000` |

## Fee Flow

| Config field | Environment variable | Default |
|---|---|---|
| `feeFlowControllerAddress` | `EULER_SDK_FEE_FLOW_CONTROLLER_ADDRESS` | deployment config |
| `feeFlowControllerUtilAddress` | `EULER_SDK_FEE_FLOW_CONTROLLER_UTIL_ADDRESS` | deployment config |
| `feeFlowDefaultBuyDeadlineSeconds` | `EULER_SDK_FEE_FLOW_DEFAULT_BUY_DEADLINE_SECONDS` | service default |

## Parsing

Booleans accept `true`, `false`, `1`, `0`, `yes`, `no`, `on`, and `off`. Number fields must be finite numbers. Invalid enum, number, boolean, or JSON values throw during `buildEulerSDK()` so misconfiguration is visible at startup.
