# Configuration Reference

`buildEulerSDK()` accepts a `BuildSDKOptions` object. Built-in scalar configuration resolves in this order:

1. `config` values passed to `buildEulerSDK()`
2. Existing explicit SDK options such as `pricingServiceConfig` or nested service configs, when a matching option exists
3. `EULER_SDK_*` environment variables
4. SDK defaults

RPC URLs are SDK-owned config and resolve from `config.rpcUrls`, then `EULER_SDK_RPC_URL_<chainId>`, then the empty default. If no RPC URL is available for a chain, on-chain reads for that chain fail when they are requested.

## Full example

```typescript
const sdk = await buildEulerSDK({
  config: {
    rpcUrls: {
      1: "https://your-mainnet-rpc",
      8453: "https://your-base-rpc",
    },
    v3ApiUrl: "https://your-v3-api",
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
    swapApiUrl: "https://swap.euler.finance",
    swapDefaultDeadline: 1800,
  },

  // Optional: service-specific adapter selection
  accountServiceConfig: { adapter: "v3" },
  eVaultServiceConfig: { adapter: "v3" },
  eulerEarnServiceConfig: { adapter: "v3" },
  rewardsServiceConfig: { adapter: "v3" },

  // Optional: global query decorator for caching/logging/profiling
  buildQuery: (queryName, queryFn, target) => queryFn,

  // Optional: plugins for read-path and plan-path extensions
  plugins: [],

  // Optional: replace any built-in service with a custom implementation
  servicesOverrides: {
    priceService: myCustomPriceService,
  },
});
```

## `config` prop

The `config` prop is the highest-priority layer for SDK-owned runtime configuration. It mirrors the `EULER_SDK_*` environment surface with typed fields, so callers can centralize runtime wiring without constructing every nested service config.

```typescript
const sdk = await buildEulerSDK({
  config: {
    rpcUrls: { 1: process.env.EULER_SDK_RPC_URL_1! },
    v3ApiUrl: process.env.EULER_SDK_V3_API_URL,
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
    accountServiceAdapter: "v3",
    eVaultServiceAdapter: "v3",
    rewardsServiceAdapter: "direct",
    tokenlistApiBaseUrl: "https://indexer.euler.finance",
  },
});
```

Use explicit nested service config when the option is a function or a custom object that cannot be represented through env/config, such as `eulerLabelsAdapterConfig`, `tokenlistServiceConfig`, `buildQuery`, `plugins`, `additionalVaultServices`, or `servicesOverrides`.

## Key options

| Option | Default | What it enables |
|---|---|---|
| `config` | `{}` | Highest-priority typed runtime config for env-controllable SDK values, including `config.rpcUrls` |
| `v3ApiKey` | none | Shared `X-API-Key` header for built-in V3 HTTP adapters |
| `pricingServiceConfig` | `https://v3.eul.dev` | V3 USD pricing endpoint with on-chain oracle fallback |
| `swapServiceConfig` | Euler swap API | Swap quote fetching |
| `rewardsServiceConfig` | `v3` adapter with direct fallback reads | Reward campaign data, per-user rewards, and reward claim planning |
| `intrinsicApyServiceConfig` | V3 intrinsic APY API | Underlying yield data for vault assets |
| `buildQuery` | 5s in-memory cache | Wrap all external queries for caching, logging, or profiling |
| `queryCacheConfig` | `{ enabled: true, ttlMs: 5000 }` | Built-in query cache settings when `buildQuery` is not supplied |
| `plugins` | `[]` | Extend on-chain reads and transaction plans |
| `servicesOverrides` | `{}` | Replace any built-in service with a custom implementation |

## V3 adapter config

When `accountServiceConfig.adapter`, `eVaultServiceConfig.adapter`, `eulerEarnServiceConfig.adapter`, `vaultTypeAdapterConfig`, `rewardsServiceConfig.adapter`, `intrinsicApyServiceConfig`, or the built-in pricing service use V3, the SDK forwards the resolved API key as an `X-API-Key` request header.

Adapter-specific keys override the shared key within the same configuration layer. Layer priority still applies, so `config.pricingApiKey` overrides `pricingServiceConfig.apiKey`, and `pricingServiceConfig.apiKey` overrides `EULER_SDK_PRICING_API_KEY`.

`vaultTypeAdapterConfig` defaults to the V3 `POST /v3/evk/vaults/resolve` endpoint. Pass subgraph config when vault type resolution should use subgraphs:

```typescript
vaultTypeAdapterConfig: {
  subgraphURLs: { 1: "https://..." },
}
```

## Environment variables

Every built-in scalar config value has a canonical `EULER_SDK_*` environment variable. See [Config Through Env](./config-through-env.md) for the full table.

Environment variables are only used when neither `config` nor the matching explicit SDK option provides a value. For RPC URLs, the explicit layer is `config.rpcUrls`.

## Defaults

Most services ship with built-in default URLs for V3 APIs, subgraphs, labels, swap API, pricing, token lists, oracle adapter metadata, and deployments. See `src/sdk/defaultConfig.ts` and [Config Through Env](./config-through-env.md) for the concrete values.

## Service overrides

Any built-in service can be replaced via `servicesOverrides`. This is useful for testing or when you need a custom implementation of a specific service. See [SDK Architecture Overview](./sdk-architecture-overview.md) for more on the dependency injection model.
