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

Use explicit nested service config when the option is a function or a custom object that cannot be represented through env/config, such as `eulerLabelsV3AdapterConfig`, `tokenlistServiceConfig`, `buildQuery`, `plugins`, `additionalVaultServices`, or `servicesOverrides`.

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

`servicesOverrides.eulerLabelsService` replaces the built-in service and takes precedence over V3 options. The application owns any custom fetching, normalization, freshness and policy; the SDK has no file URL config or file-fetching adapter. With `disableV3: true` and no custom service, SDK construction succeeds and labels reads throw without HTTP. V3 failures propagate without an automatic alternate source. See [Custom labels flows](./labels.md#custom-labels-flows).

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


## Subgraph sources for forks

Forks can use **direct per-chain GraphQL URLs**, an **opt-in catalog**, or both. Direct URLs remain first-class: no catalog publication or `_meta` deployment identity is required for them. The endpoints must implement the account-discovery or factory-lookup GraphQL schema used by the respective SDK adapter.

For each chain and purpose, endpoint selection follows this priority:

1. `config.accountVaultsSubgraphUrls` or `config.vaultTypeSubgraphUrls` entry.
2. `accountVaultsAdapterConfig.subgraphURLs` or `vaultTypeAdapterConfig.subgraphURLs` entry.
3. The matching `EULER_SDK_ACCOUNT_VAULTS_SUBGRAPH_URL_<chainId>` or `EULER_SDK_VAULT_TYPE_SUBGRAPH_URL_<chainId>` entry.
4. The purpose-specific resolver, otherwise the shared `config.subgraphCatalog` resolver when enabled; without either resolver, the SDK's bundled subgraph URL.

Maps merge per chain; `{}` does not clear lower-priority entries. A `false` entry disables that purpose for that chain and rejects with `SubgraphUnavailableError` reason `disabled`. Omitting `subgraphCatalog` or setting it to `false` disables catalog discovery **but retains bundled fallback for unmapped chains**. A supplied resolver suppresses bundled URLs for its purpose, and resolver errors propagate without falling back to those URLs. Explicit map entries still win over that resolver, including entries from the environment.

These settings control the built-in subgraph adapters. Select `accountServiceAdapter: "onchain"` and `vaultTypeAdapter: "subgraph"` to use them directly; a V3-only service does not use them, and a `"fallback"` service tries V3 first. See [Fallback System](./fallback-system.md). `accountVaultsAdapterConfig.resolver` overrides the shared resolver for account discovery; for vault lookup use `vaultTypeAdapterConfig: { subgraphURLs: {}, resolver }`. The `subgraphURLs` property selects the subgraph variant of that adapter config. `servicesOverrides.accountService` and `servicesOverrides.vaultMetaService` remain authoritative and own their data sources.

### Direct URLs only, without bundled subgraph fallback

Supply the fork's URLs and a shared resolver that rejects every unmapped chain. Despite the `subgraphCatalog` property name, this injected resolver performs **no catalog HTTP requests**. Requests for unspecified chains fail instead of reaching an Euler bundled subgraph.

```typescript
import {
  buildEulerSDK,
  SubgraphUnavailableError,
  type SubgraphResolver,
} from "@eulerxyz/euler-v2-sdk";

const rejectUnmapped: SubgraphResolver = {
  async resolve(chainId) {
    throw new SubgraphUnavailableError("missing", chainId);
  },
};

const sdk = await buildEulerSDK({
  config: {
    rpcUrls: { 1: "https://rpc.fork.example" },
    accountServiceAdapter: "onchain",
    vaultTypeAdapter: "subgraph",
    accountVaultsSubgraphUrls: { 1: "https://graph.fork.example/accounts" },
    vaultTypeSubgraphUrls: { 1: "https://graph.fork.example/factories" },
    subgraphCatalog: { resolver: rejectUnmapped },
  },
});
```

Keep both subgraph environment-variable families unset, or set them only to fork-owned endpoints: environment entries are explicit URLs and bypass `rejectUnmapped`. Apply the same rule to any top-level adapter maps merged into these options. There is no global subgraph-off flag; use per-chain `false` entries or a rejecting resolver for unmapped chains.

### Fork-owned catalog with optional direct overrides

A fork can publish its own v1 catalog and use direct URLs for selected chains or purposes. Catalog discovery handles only the remaining chains; missing, invalid or retired catalog records reject without bundled fallback.

```typescript
import { buildEulerSDK } from "@eulerxyz/euler-v2-sdk";

const sdk = await buildEulerSDK({
  config: {
    rpcUrls: { 1: "https://rpc.fork.example", 8453: "https://base-rpc.fork.example" },
    accountServiceAdapter: "onchain",
    vaultTypeAdapter: "subgraph",
    subgraphCatalog: { url: "https://metadata.fork.example/catalog.v1.json" },
    // Chain 1 bypasses catalog discovery; chain 8453 uses the fork's catalog.
    accountVaultsSubgraphUrls: { 1: "https://graph.fork.example/accounts" },
    vaultTypeSubgraphUrls: { 1: "https://graph.fork.example/factories" },
  },
});
```

Keep lower-priority adapter/environment maps fork-owned here too. To avoid metadata HTTP entirely while retaining catalog validation, supply the v1 object as `subgraphCatalog: { catalog: snapshot }`. See the catalog contract below for capabilities, identity checks, refresh and failure behavior.

Both examples isolate **subgraph selection**, not all SDK traffic. Configure the fork's V3 endpoints or use [`disableV3: true`](./fallback-system.md#service-behavior), provide [custom labels](./labels.md#custom-labels-flows) when needed, and separately review [RPC configuration](#chains), [deployments and ABI sources](./config-through-env.md#pricing-swaps-and-euler-interfaces), and other [service defaults](./config-through-env.md). A custom `deploymentsUrl` changes deployment metadata without changing the ABI branch. Disabling V3 or catalog discovery does not disable every Euler-hosted service.

## Opt-in subgraph catalog

`config.subgraphCatalog` enables lazy endpoint discovery for built-in account position discovery and vault factory lookup. Omit it or set it to `false` to retain bundled compatibility defaults for purposes without an injected resolver. It does not enable RPC chains or change V3, labels, chain lifecycle, deployment or ABI sources.

```typescript
const sdk = await buildEulerSDK({
  config: {
    subgraphCatalog: { url: "https://operator.example/catalog.json" },
    accountVaultsSubgraphUrls: { 1: "/api/account-subgraph", 8453: false },
    vaultTypeSubgraphUrls: { 1: "/api/factory-subgraph", 8453: false },
  },
});
```

The empty object `{}` selects `DEFAULT_SUBGRAPH_CATALOG_URL`, currently a **future publication target** at `https://raw.githubusercontent.com/euler-xyz/euler-subgraph/catalog/v1/catalog.json`. This SDK change does not publish that catalog. Use an operator URL or supplied snapshot until publication is available.

Each purpose resolves independently: `config` URL entries override its top-level adapter URL entries, which override `EULER_SDK_ACCOUNT_VAULTS_SUBGRAPH_URL_<chainId>` or `EULER_SDK_VAULT_TYPE_SUBGRAPH_URL_<chainId>`. A `false` map entry explicitly disables that purpose and throws `SubgraphUnavailableError` with reason `disabled`. Empty maps retain merging behavior. With catalog discovery enabled, absent explicit entries resolve from the catalog; bundled URLs do not substitute for missing, invalid or retired records. Without catalog discovery or a purpose-specific resolver, bundled defaults and existing missing-URL behavior apply. Explicit URLs retain HTTP, browser-relative and operator-authenticated transports.

`subgraphCatalog` accepts `catalog` (a supplied v1 snapshot), `url`, `fetch` (metadata transport), `resolver`, `channel`, `freshMs`, `maxAgeMs`, `retryMs`, `timeoutMs`, and `now`. `resolver` takes precedence over `catalog`, which takes precedence over URL/fetch. A supplied snapshot is static for that resolver instance and makes no metadata request. The `SubgraphResolver.resolve(chainId, capability)` contract returns `{ endpoint, deploymentId }` or rejects; injected resolvers own their refresh/error policy. Purpose-specific `accountVaultsAdapterConfig.resolver` and `vaultTypeAdapterConfig.resolver` override the shared catalog resolver. Custom account/vault services remain authoritative. SDK construction and explicitly mapped requests do not fetch catalog metadata.

Active catalog records require endpoint, deployment ID, version, identity and capabilities. Build provenance (`sourceCommit`, `startBlock`, and `interfacesCommit`) is optional and must be valid when supplied. Imported existing deployments omit unverified build fields; a deployment ID does not prove a source commit or compiled start block. Endpoint/deployment identity checks, including `expectedSource`, apply equally to imported and build-verified records. Direct overrides and fork isolation follow the same priority rules for both.

URL-backed metadata is fresh for 60 seconds, may use last-good data for at most 5 minutes from successful fetch/parse, and backs off failed refreshes for 10 seconds. Requests time out after 10 seconds. Concurrent refreshes share one request; failures never extend last-good age. Cache state belongs to one resolver instance. Fresh valid retirement or invalid identity metadata replaces the previous snapshot immediately. Unknown families/channels are ignored, duplicate or invalid supported identities are quarantined, and malformed envelopes/unknown schema versions fail validation. Public catalog endpoints require HTTPS without credentials, query or fragment; this restriction does not apply to explicit operator URLs or injected resolvers.

Stable is the default channel; candidate selection requires `channel: "candidate"`. The two capabilities are `account-vault-discovery` and `vault-factory-lookup`; neither implies Activity, prices or APYs. Catalog `deploymentId` identifies the published deployment, not its current health.

Catalog-backed discovery queries bypass `buildQuery` result caching so metadata freshness and retirement are evaluated on each discovery operation. Explicit URL-map query wrappers and RPC query caching remain enabled. Every batched/paginated discovery read uses one resolved endpoint per chain. Catalog-backed GraphQL requests include `_meta { deployment }` and validate the returned deployment identity on every page. Missing identity is invalid and a mismatch rejects with `source-changed`. Explicit URL maps keep their existing schema requirements and operator transport semantics; they do not require `_meta`.

Simple `fetchAccountVaults` / `fetchVaultFactories` calls keep their existing return shapes. Their adapter-wide `source-changed` notice is advisory: an unrelated read can receive that notice first. It does not protect a baseline held by a separate polling operation. Applications must likewise avoid indefinitely caching outer service calls across metadata changes.

For a multi-read operation, the exported `AccountVaultsSubgraphAdapter.fetchAccountVaultsWithSource(chainId, account, options?)` and `VaultTypeSubgraphAdapter.fetchVaultFactoriesWithSource(chainId, addresses, options?)` methods return `SubgraphReadResult<T>` (`{ value, source? }`). `SubgraphReadOptions.expectedSource` accepts the baseline's `{ endpoint, deploymentId }`. Each expected-source read independently rejects with `source-changed` before querying if the resolver selects a different endpoint or deployment. Concurrent reads with different expectations are isolated, and another reader cannot consume this protection. A baseline read without an expectation uses the current source without the adapter-wide notice.

```typescript
import {
  AccountVaultsSubgraphAdapter,
  createSubgraphCatalogResolver,
} from "@eulerxyz/euler-v2-sdk";

const discovery = new AccountVaultsSubgraphAdapter({
  subgraphURLs: {},
  resolver: createSubgraphCatalogResolver({
    url: "https://operator.example/catalog.json",
  }),
});
const baseline = await discovery.fetchAccountVaultsWithSource(chainId, account);
if (!baseline.source) throw new Error("Catalog provenance is required");
const next = await discovery.fetchAccountVaultsWithSource(chainId, account, {
  expectedSource: baseline.source,
});
// Compare baseline.value with next.value only after this read succeeds.
```

Keep the baseline and its source together for the whole operation. On `source-changed`, discard that baseline and restart the operation with a new source-aware baseline; repeatedly retrying the same expectation keeps rejecting. These methods verify endpoint/deployment identity, not indexed block freshness, transaction inclusion, or finality. The guarantee applies to catalog/resolver-backed built-in queries. Explicit URL maps and custom query overrides retain their transport behavior and return no source. Supplying `expectedSource` when provenance cannot be verified rejects with `source-changed`; it never silently drops the expectation. A built-in query explicitly disabled with `false` rejects with `disabled`, including when an expectation is supplied; custom query overrides own their transport behavior. These adapter methods are opt-in and do not change top-level service return types.

Unavailable discovery rejects instead of reporting empty positions. `SubgraphUnavailableError.reason` distinguishes `invalid`, `missing`, `retired`, `unsupported-capability`, `disabled`, `source-failed`, and `source-changed`. Existing HTTP/GraphQL response validation still applies to the selected endpoint.
