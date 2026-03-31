# Configuration Reference

`buildEulerSDK()` accepts a `BuildSDKOptions` object. Only `rpcUrls` is required — everything else has sensible defaults or is optional.

## Full example

```typescript
const sdk = await buildEulerSDK({
  // Required: RPC endpoints keyed by chain ID
  rpcUrls: {
    1: "https://your-mainnet-rpc",
    8453: "https://your-base-rpc",
  },

  // Optional: shared API key for built-in V3 account/vault adapters
  v3ApiKey: process.env.EULER_V3_API_KEY,

  // Optional: override the pricing backend endpoint (default: V3 prices API)
  backendConfig: {
    endpoint: "https://your-v3-api",
  },

  // Optional: swap API endpoint (default: https://swap.euler.finance)
  swapServiceConfig: {
    swapApiUrl: "https://swap.euler.finance",
    defaultDeadline: 1800, // seconds
  },

  // Optional: rewards adapters
  rewardsServiceConfig: {
    adapter: "v3",
    v3AdapterConfig: {
      endpoint: "https://your-v3-api",
    },
    directAdapterConfig: {
      merklApiUrl: "https://...",
      brevisApiUrl: "https://...",
      brevisProofsApiUrl: "https://...",
      fuulApiUrl: "https://...",
      fuulTotalsUrl: "https://your-app/api/fuul/totals",
      fuulClaimChecksUrl: "https://your-app/api/fuul/claim-checks",
      fuulManagerAddress: "0x...",
      fuulFactoryAddress: "0x...",
    },
  },

  // Optional: intrinsic APY data sources
  intrinsicApyServiceConfig: {
    adapter: "v3",
    v3AdapterConfig: {
      endpoint: "https://your-v3-api",
      maxAssetsPerRequest: 50,
    },
  },

  // Optional: oracle adapter metadata API
  oracleAdapterServiceConfig: {
    baseUrl: "https://...",
    cacheMs: 60000,
  },

  // Optional: subgraph URLs for account vault discovery
  accountVaultsAdapterConfig: {
    subgraphURLs: { 1: "https://..." },
  },

  // Optional: V3 or subgraph config for vault type resolution
  vaultTypeAdapterConfig: {
    endpoint: "https://your-v3-api",
  },

  // Optional: V3 HTTP adapters for account/vault reads
  accountServiceConfig: {
    adapter: "v3",
    v3AdapterConfig: {
      endpoint: "https://your-v3-api",
    },
  },
  eVaultServiceConfig: {
    adapter: "v3",
    v3AdapterConfig: {
      endpoint: "https://your-v3-api",
    },
  },
  eulerEarnServiceConfig: {
    adapter: "v3",
    v3AdapterConfig: {
      endpoint: "https://your-v3-api",
    },
  },

  // Optional: euler-labels metadata URLs
  eulerLabelsAdapterConfig: {
    getEulerLabelsVaultsUrl: (chainId) => `https://.../${chainId}/vaults.json`,
    // ...
  },

  // Optional: token list API
  tokenlistServiceConfig: {
    getTokenListUrl: (chainId) => `https://...?chainId=${chainId}`,
  },

  // Optional: global query decorator for caching/logging/profiling
  buildQuery: (queryFn) => queryFn,

  // Optional: plugins for read-path and plan-path extensions
  plugins: [],

  // Optional: replace any built-in service with a custom implementation
  servicesOverrides: {
    priceService: myCustomPriceService,
    // any service can be overridden
  },
});
```

## Key options

| Option | Default | What it enables |
|---|---|---|
| `rpcUrls` | _(required)_ | On-chain data reads for all services |
| `v3ApiKey` | none | Shared `X-API-Key` header for built-in V3 account/vault adapters |
| `backendConfig` | `v3staging.eul.dev` | Off-chain USD pricing backend (backend-first, on-chain oracle fallback). Built-in client uses `GET /v3/prices`. |
| `swapServiceConfig` | Euler swap API | Swap quote fetching |
| `rewardsServiceConfig` | `v3` adapter with direct fallback reads | Reward campaign data, per-user rewards, and reward claim planning |
| `intrinsicApyServiceConfig` | DefiLlama + Pendle | Underlying yield data for vault assets |
| `buildQuery` | identity | Wrap all external queries (useful for caching, see [Caching docs](./caching-external-data-queries.md)) |
| `plugins` | `[]` | Extend on-chain reads and transaction plans (see [Plugins docs](./plugins.md)) |
| `servicesOverrides` | `{}` | Replace any built-in service with a custom implementation |

## V3 adapter config

When `accountServiceConfig.adapter`, `eVaultServiceConfig.adapter`, `eulerEarnServiceConfig.adapter`, `vaultTypeAdapterConfig`, `rewardsServiceConfig.adapter`, or the built-in pricing backend use V3, the SDK forwards `v3ApiKey` as an `X-API-Key` request header for all built-in V3 adapters. There is no default API key in SDK config; provide it explicitly when your V3 deployment requires authentication.

If you need different keys per adapter, `accountServiceConfig.v3AdapterConfig.apiKey`, `eVaultServiceConfig.v3AdapterConfig.apiKey`, `eulerEarnServiceConfig.v3AdapterConfig.apiKey`, `vaultTypeAdapterConfig.apiKey`, `rewardsServiceConfig.v3AdapterConfig.apiKey`, and `backendConfig.apiKey` still override the top-level value.

`vaultTypeAdapterConfig` now defaults to the V3 `POST /v3/evk/vaults/resolve` endpoint. If you need the legacy behavior, you can still pass subgraph config instead:

```typescript
vaultTypeAdapterConfig: {
  subgraphURLs: { 1: "https://..." },
}
```

## Environment variables

Several defaults can be overridden via environment variables without changing code:

| Variable | What it overrides | Default |
|---|---|---|
| `PRICING_API_URL` | `backendConfig.endpoint` | `https://v3staging.eul.dev` |
| `SWAP_API_URL` | `swapServiceConfig.swapApiUrl` | `https://swap.euler.finance` |
| `DEPLOYMENTS_URL` | Deployments JSON URL | `https://raw.githubusercontent.com/euler-xyz/euler-interfaces/.../EulerChains.json` |
| `TOKENLIST_API_BASE` | Token list API base URL | `https://indexer.euler.finance` |

Environment variables are only used when the corresponding config option is not explicitly provided to `buildEulerSDK()`. Explicit config always takes precedence.

## Defaults

Most services ship with built-in default URLs (subgraphs, labels, swap API, pricing, token lists). See `src/sdk/defaultConfig.ts` for the full list. You only need to override a config if you want to point at a different data source.

## Service overrides

Any built-in service can be replaced via `servicesOverrides`. This is useful for testing or when you need a custom implementation of a specific service. See [SDK Architecture Overview](./sdk-architecture-overview.md) for more on the dependency injection model.
