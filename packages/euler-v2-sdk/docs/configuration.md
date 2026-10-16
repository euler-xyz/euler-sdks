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
    activityV3ApiUrl: process.env.EULER_SDK_ACTIVITY_V3_API_URL,
    activityV3ApiKey: process.env.EULER_SDK_ACTIVITY_V3_API_KEY,
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
    tokenlistApiBaseUrl: "https://v3.euler.finance",
  },
});
```

Use explicit nested service config when the option is a function or a custom object that cannot be represented through env/config, such as `eulerLabelsV3AdapterConfig`, `eulerLabelsAdapterConfig`, `tokenlistServiceConfig`, `buildQuery`, `plugins`, `additionalVaultServices`, or `servicesOverrides`.

## Key options

| Option | Default | What it enables |
|---|---|---|
| `config` | `{}` | Highest-priority typed runtime config for env-controllable SDK values, including `config.rpcUrls` |
| `v3ApiKey` | none | Shared `X-API-Key` header for built-in V3 HTTP adapters |
| `pricingServiceConfig` | `https://v3.euler.finance` | V3 USD pricing endpoint with on-chain oracle fallback |
| `swapServiceConfig` | Euler swap API | Swap quote fetching |
| `rewardsServiceConfig` | `v3` adapter with direct Brevis/Fuul helper reads | Reward campaign data, per-user rewards, and reward claim planning |
| `intrinsicApyServiceConfig` | V3 intrinsic APY API | Underlying yield data for vault assets |
| `activityServiceConfig` | V3 activity API | Normalized account and vault event timelines with coverage metadata |
| `eulerLabelsV3AdapterConfig` | Public Labels V3, `public` / `latest` | Published metadata, live visibility and geo policies; optional dataset, publication and request override |
| `eulerLabelsAdapterConfig` | none | Explicit JSON file source for compatibility |
| `buildQuery` | 5s in-memory cache | Wrap all external queries for caching, logging, or profiling |
| `queryCacheConfig` | `{ enabled: true, ttlMs: 5000, failureTtlMs: 5000 }` | Built-in query cache settings when `buildQuery` is not supplied |
| `plugins` | `[]` | Extend on-chain reads and transaction plans |
| `chains` | `{}` | Viem chains for chains viem lacks, patches to resolved chains, and per-chain transport tuning |
| `servicesOverrides` | `{}` | Replace any built-in service with a custom implementation |

## Chains

The provider service builds a viem public client for each resolvable chain in `rpcUrls`. Each chain resolves in this order:

1. `chains[chainId]` when it is a complete viem `Chain`.
2. The EulerChains `viemName` from the deployments document, for chain ids that viem exports more than once.
3. The only viem chain with that id.

A chain missing from the pinned viem catalog is excluded from `providerService.getSupportedChainIds()`, including when its registry `viemName` is also absent from viem. Other configured chains remain usable. Calling `getProvider(chainId)` for the missing chain throws an error explaining how to supply a complete `chains` override or update the viem pin and registry metadata. If every configured chain is missing, the supported provider list is empty, as it is with an empty RPC configuration. Compare the supported ids with the configured RPC chain ids at application startup to detect unavailable chains, and call `getProvider(chainId)` for the diagnostic.

Ambiguous chain ids, invalid or mismatched `viemName` values for known chains, and invalid chain overrides still fail `buildEulerSDK()` initialization. A partial override requires a base chain that viem can resolve.

A partial `chains[chainId]` patches the resolved chain: `contracts`, `blockExplorers` and `rpcUrls` merge by key, other fields replace. The same entry can carry `transport` tuning for that chain: `http` options for viem's `http()` transport and `multicall` batching options, each merged over the SDK defaults.

```typescript
import { defineChain } from "viem";

const sdk = await buildEulerSDK({
  config: { rpcUrls: { 146: "https://your-sonic-rpc", 777001: "https://your-rpc" } },
  chains: {
    // A chain viem does not ship yet
    777001: defineChain({
      id: 777001,
      name: "New Chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["https://your-rpc"] } },
      contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
    }),
    // Smaller multicall batches for one chain
    146: { transport: { multicall: { batchSize: 128 } } },
  },
});
```

Browser builds do not embed viem's chain list. The package's `browser` field maps the chain list module to one that loads `viem/chains` with a dynamic import, which bundlers emit as a separate chunk. `buildEulerSDK()` and `ProviderService.build()` load that chunk only when a chain in `rpcUrls` is not a complete `chains` entry, so an app that supplies every chain never downloads it. Construct `ProviderService` with `await ProviderService.build(rpcUrls, options)` in browser code; the synchronous constructor resolves chains from viem only after the list has loaded.

## V3 adapter config

When `accountServiceConfig.adapter`, `eVaultServiceConfig.adapter`, `eulerEarnServiceConfig.adapter`, `vaultTypeAdapterConfig`, `rewardsServiceConfig.adapter`, `intrinsicApyServiceConfig`, `activityServiceConfig`, the default labels service, or the built-in pricing service use V3, the SDK forwards the resolved API key as an `X-API-Key` request header.

Activity uses the shared `v3ApiUrl` and `v3ApiKey` by default. Set
`activityV3ApiUrl` and `activityV3ApiKey`, or their
`EULER_SDK_ACTIVITY_V3_API_URL` and `EULER_SDK_ACTIVITY_V3_API_KEY`
environment variables, when activity requests use a separate endpoint or key.

Adapter-specific keys override the shared key within the same configuration layer. Layer priority still applies, so `config.pricingApiKey` overrides `pricingServiceConfig.apiKey`, and `pricingServiceConfig.apiKey` overrides `EULER_SDK_PRICING_API_KEY`.

## Labels source selection

Labels default to Public Labels V3 with the shared `v3ApiUrl`, `v3ApiKey` and `buildQuery`. `eulerLabelsV3AdapterConfig` accepts `endpoint`, `apiKey`, `labelSet`, `version` and an application-owned `request` function. Endpoint/key priority follows the standard config layers.

Explicit file data settings (`eulerLabelsAdapterConfig`, `eulerLabelsBaseUrl`, or file URL templates/environment variables) select `EulerLabelsURLAdapter` compatibility mode. A logo-only template does not select files. File and V3 adapter settings together throw rather than silently choosing one. `servicesOverrides.eulerLabelsService` takes precedence over both. With `disableV3: true` and no explicit file/service source, SDK construction succeeds and labels reads throw without HTTP. V3 failures never trigger a file fallback. See [Labels](./labels.md).

## Turtle Earn API key

The direct rewards adapter calls the Turtle Earn API, which requires an `X-API-Key` header on every endpoint. Set `config.rewardsTurtleApiKey`, `rewardsServiceConfig.turtleApiKey`, or `EULER_SDK_REWARDS_TURTLE_API_KEY`; the usual layer priority applies. The key is a server-side secret and must not be shipped to browser bundles. See [`config-through-env.md`](./config-through-env.md#rewards) for the browser guidance.

`vaultTypeAdapterConfig` defaults to the V3 `POST /v3/resolve/vaults` endpoint. Pass subgraph config when vault type resolution should use subgraphs:

```typescript
vaultTypeAdapterConfig: {
  subgraphURLs: { 1: "https://..." },
}
```

## Environment variables

Every built-in scalar config value has a canonical `EULER_SDK_*` environment variable. See [Config Through Env](./config-through-env.md) for the full table.

Environment variables are only used when neither `config` nor the matching explicit SDK option provides a value. For RPC URLs, the explicit layer is `config.rpcUrls`.

## Defaults

Most services ship with built-in default URLs for V3 APIs, subgraphs, labels, swap API, pricing, token lists, oracle adapter assessments, and deployments. See `src/sdk/defaultConfig.ts` and [Config Through Env](./config-through-env.md) for the concrete values.

## Service overrides

Any built-in service can be replaced via `servicesOverrides`. This is useful for testing or when you need a custom implementation of a specific service. See [SDK Architecture Overview](./sdk-architecture-overview.md) for more on the dependency injection model.
