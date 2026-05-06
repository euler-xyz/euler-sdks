# Caching External Data Queries

All external data fetching in the SDK (RPC calls, subgraph queries, HTTP requests) goes through **injectable `query*` methods**. This lets consumers wrap every network call with caching, logging, profiling, or any other cross-cutting concern without modifying SDK internals.

By default, `buildEulerSDK()` applies a short-lived in-memory cache to every decorated `query*` method. The built-in cache is enabled automatically with a `5000ms` TTL and helps deduplicate bursts of identical reads during normal SDK usage. You can change this behavior by providing your own `buildQuery` wrapper.

## How It Works

Every class that fetches external data defines its fetchers as arrow-function properties named `query*`:

```typescript
class EVaultOnchainAdapter {
  constructor(/* ... */, buildQuery?: BuildQueryFn) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  queryEVaultInfoFull = async (provider, lensAddress, vault) => {
    // RPC call via viem
  };
}
```

At construction time, `applyBuildQuery` iterates all own properties starting with `"query"` and replaces each with `buildQuery(queryName, originalFn)`. The `BuildQueryFn` type:

```typescript
type BuildQueryFn = <T extends (...args: any[]) => Promise<any>>(
  queryName: string,
  fn: T,
  target: object,
) => T;
```

Pass `buildQuery` once when building the SDK and it propagates to every service and adapter:

```typescript
const sdk = await buildEulerSDK({
  rpcUrls: { 1: 'https://...' },
  queryCacheConfig: { ttlMs: 5000 }, // Optional: default is enabled with a 5s TTL
  buildQuery: myBuildQueryFn,
  plugins: [createPythPlugin({ buildQuery: myBuildQueryFn })],
})
```

If you provide `buildQuery`, it fully replaces the default cache layer for SDK queries. The built-in cache only applies when `buildQuery` is omitted.

## Default Cache Configuration

Configure the built-in cache through `queryCacheConfig`:

```typescript
const sdk = await buildEulerSDK({
  rpcUrls: { 1: 'https://...' },
  queryCacheConfig: {
    enabled: true, // default
    ttlMs: 5000,   // default
  },
})
```

Disable it entirely:

```typescript
const sdk = await buildEulerSDK({
  rpcUrls: { 1: 'https://...' },
  queryCacheConfig: { enabled: false },
})
```

Provide your own `buildQuery` if you want full control over query decoration:

```typescript
const sdk = await buildEulerSDK({
  rpcUrls: { 1: 'https://...' },
  buildQuery: myBuildQueryFn, // Replaces the default cache layer
})
```

## React Example — Wrapping Queries with react-query Cache

The `examples/react-sdk-example` app shows how to use `buildQuery` to give every SDK network call its own react-query cache entry with per-query stale times. In this setup, the custom `buildQuery` replaces the SDK's default cache layer for those queries.

### The `buildQuery` wrapper

```typescript
import { QueryClient } from "@tanstack/react-query";
import type { BuildQueryFn } from "@eulerxyz/euler-v2-sdk";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

export const sdkBuildQuery: BuildQueryFn = (queryName, fn) => {
  const staleTime = STALE_TIMES[queryName] ?? DEFAULT_STALE_TIME;

  const wrapped = (...args: unknown[]) =>
    queryClient.fetchQuery({
      queryKey: ["sdk", queryName, ...args.map(serializeArg)],
      queryFn: () => fn(...args),
      staleTime,
    });

  return wrapped as typeof fn;
};
```

Each `query*` call becomes a `fetchQuery` with a deterministic cache key derived from the query name and serialized arguments. If the cached value is fresh (within `staleTime`), no network call is made.

### Central stale time settings

```typescript
const MINUTE = 60_000;

const STALE_TIMES: Record<string, number> = {
  // Static metadata — essentially never changes
  queryDeployments: Infinity,
  queryABI: Infinity,
  queryTokenList: Infinity,
  queryEulerLabelsEntities: Infinity,
  queryEulerLabelsProducts: Infinity,
  queryEulerLabelsPoints: Infinity,
  queryEulerLabelsEarnVaults: Infinity,
  queryEulerLabelsAssets: Infinity,

  // Perspective / factory lists — change only when new vaults are deployed
  queryEVaultVerifiedArray: 5 * MINUTE,
  queryEulerEarnVerifiedArray: 5 * MINUTE,
  queryVaultFactories: 5 * MINUTE,

  // On-chain vault state — moderate refresh
  queryEVaultInfoFull: 20_000,
  queryEulerEarnVaultInfoFull: 20_000,
  queryEulerEarnConvertToAssets: 20_000,
  queryBlockNumber: 10_000,
  queryBlock: 10_000,
  queryVaultInfoERC4626: 20_000,

  // Vault config — slow-changing
  querySecuritizeVaultGovernorAdmin: 60 * MINUTE,
  querySecuritizeVaultSupplyCapResolved: 60 * MINUTE,

  // Prices
  queryAssetPriceInfo: MINUTE,
  queryV3Price: MINUTE,

  // Swap quotes — very short-lived
  querySwapQuotes: 10_000,
  querySwapProviders: 60 * MINUTE, // providers rarely change

  // Pyth plugin — price update data is short-lived
  queryPythUpdateData: 10_000,
  queryPythUpdateFee: 30_000,

  // Intrinsic APY — external API data
  queryV3IntrinsicApy: 5 * MINUTE,

  // Account / subgraph lookups
  queryAccountVaults: 30_000,

  // Per-user on-chain state — changes on every tx
  queryEVCAccountInfo: 15_000,
  queryVaultAccountInfo: 15_000,
  queryBalanceOf: 15_000,
  queryAllowance: 15_000,
  queryPermit2Allowance: 15_000,
};

const DEFAULT_STALE_TIME = MINUTE;
```

### SDK initialization

```typescript
import { buildEulerSDK, createPythPlugin } from "@eulerxyz/euler-v2-sdk";
import { sdkBuildQuery, queryClient } from "./sdkQueries";

// In a React component/provider:
const sdk = await buildEulerSDK({
  rpcUrls: RPC_URLS,
  buildQuery: sdkBuildQuery,
  plugins: [createPythPlugin({ buildQuery: sdkBuildQuery })],
});

// Wrap your app with QueryClientProvider:
<QueryClientProvider client={queryClient}>
  {/* ... */}
</QueryClientProvider>
```

The higher-level `fetch*` service methods (e.g. `fetchVault`, `fetchAccount`) orchestrate multiple already-cached `query*` calls. Re-running a service method is cheap — only `query*` calls whose `staleTime` has expired actually hit the network.

## Complete Query Reference

### Core Services

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryDeployments` | url | `DeploymentService` (static) | `(url)` | Fetch deployment addresses from URL |
| `queryABI` | url | `ABIService` | `(url)` | Fetch ABI JSON from URL |
| `queryTokenList` | url | `TokenlistService` | `(url)` | Fetch token list from URL |
| `querySwapQuotes` | url | `SwapService` | `(url)` | Fetch swap quotes from aggregator API |
| `querySwapProviders` | url | `SwapService` | `(url)` | Fetch available swap providers for a chain |

### Vault Adapters

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryEVaultInfoFull` | rpc | `EVaultOnchainAdapter` | `(provider, vaultLensAddress, vault)` | Read full vault state via VaultLens |
| `queryEVaultVerifiedArray` | rpc | `EVaultOnchainAdapter` | `(provider, perspective)` | Read verified vault list from Perspective |
| `queryV3EVaultDetail` | url | `EVaultV3Adapter` | `(endpoint, chainId, vault)` | Fetch EVault detail via V3 |
| `queryV3EVaultCollaterals` | url | `EVaultV3Adapter` | `(endpoint, chainId, vault)` | Fetch EVault collateral rows via V3 |
| `queryV3EVaultList` | url | `EVaultV3Adapter` | `(endpoint, chainId, offset, limit)` | Fetch paginated EVault list via V3 |
| `queryEulerEarnVaultInfoFull` | rpc | `EulerEarnOnchainAdapter` | `(provider, lensAddress, vault)` | Read EulerEarn vault state via EulerEarnVaultLens |
| `queryEulerEarnConvertToAssets` | rpc | `EulerEarnOnchainAdapter` | `(provider, vault, shares, blockNumber?)` | Read `convertToAssets` for current or historical 1h APY sampling |
| `queryEulerEarnVerifiedArray` | rpc | `EulerEarnOnchainAdapter` | `(provider, perspective)` | Read verified EulerEarn vault list |
| `queryBlockNumber` | rpc | `EulerEarnOnchainAdapter` | `(provider)` | Read current block number for 1h APY sampling |
| `queryBlock` | rpc | `EulerEarnOnchainAdapter` | `(provider, blockNumber)` | Read block timestamp for 1h APY sampling |
| `queryV3EulerEarnDetail` | url | `EulerEarnV3Adapter` | `(endpoint, chainId, vault)` | Fetch EulerEarn detail via V3 |
| `queryV3EulerEarnList` | url | `EulerEarnV3Adapter` | `(endpoint, chainId, offset, limit)` | Fetch paginated EulerEarn vault list via V3 |
| `queryVaultInfoERC4626` | rpc | `SecuritizeVaultOnchainAdapter` | `(provider, utilsLensAddress, vault)` | Read ERC4626 vault info |
| `querySecuritizeVaultGovernorAdmin` | rpc | `SecuritizeVaultOnchainAdapter` | `(provider, vault)` | Read governor admin address |
| `querySecuritizeVaultSupplyCapResolved` | rpc | `SecuritizeVaultOnchainAdapter` | `(provider, vault)` | Read resolved supply cap |
| `queryV3VaultResolve` | url | `VaultTypeV3Adapter` | `({ address, chainId })` | Resolve vault type for a single vault via `POST /v3/evk/vaults/resolve` (auto-bundled) |
| `queryVaultFactories` | gql | `VaultTypeSubgraphAdapter` | `({ address, chainId })` | Fetch vault factory for a single vault (auto-bundled) |

### Account Adapters

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryEVCAccountInfo` | rpc | `AccountOnchainAdapter` | `(provider, accountLensAddress, evc, subAccount)` | Read EVC account state (controllers, collaterals) |
| `queryVaultAccountInfo` | rpc | `AccountOnchainAdapter` | `(provider, accountLensAddress, subAccount, vault)` | Read per-vault account position |
| `queryEVaultInfoFull` | rpc | `AccountOnchainAdapter` | `(provider, vaultLensAddress, vault)` | Read vault info for account context |
| `queryV3AccountPositions` | url | `AccountV3Adapter` | `(endpoint, chainId, address, forceFresh?)` | Fetch account positions via V3 |
| `queryAccountVaults` | gql | `AccountVaultsSubgraphAdapter` | `({ chainId, account })` | Query account vault history from subgraph (auto-bundled) |

### Wallet Adapter

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryBalanceOf` | rpc | `WalletOnchainAdapter` | `(provider, asset, account)` | Read ERC20 balance |
| `queryAllowance` | rpc | `WalletOnchainAdapter` | `(provider, asset, owner, spender)` | Read ERC20 allowance |
| `queryPermit2Allowance` | rpc | `WalletOnchainAdapter` | `(provider, permit2Address, owner, asset, spender)` | Read Permit2 allowance |

### Price Service

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryAssetPriceInfo` | rpc | `PriceService` | `(provider, utilsLensAddress, assetAddress)` | Read on-chain oracle price for an asset |
| `queryV3Price` | url | `PricingBackendClient` | `({ address, chainId })` | Fetch asset price from `GET /v3/prices` (auto-bundled) |

### Labels Service

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryEulerLabelsEntities` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch entity labels from Euler API |
| `queryEulerLabelsProducts` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch product labels from Euler API |
| `queryEulerLabelsPoints` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch points labels from Euler API |
| `queryEulerLabelsEarnVaults` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch Euler Earn vault label metadata |
| `queryEulerLabelsAssets` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch chain-specific and global asset rules |

### Rewards Service

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryMerklOpportunities` | url | `RewardsDirectAdapter` | `(url)` | Fetch Merkl reward opportunities |
| `queryBrevisCampaigns` | url | `RewardsDirectAdapter` | `(url, body)` | Fetch Brevis reward campaigns |
| `queryMerklUserRewards` | url | `RewardsDirectAdapter` | `(url)` | Fetch Merkl user reward balances |
| `queryBrevisUserProofs` | url | `RewardsDirectAdapter` | `(url, body)` | Fetch Brevis user reward proofs |
| `queryFuulIncentives` | url | `RewardsDirectAdapter` | `(url)` | Fetch Fuul incentive campaigns |
| `queryFuulTotals` | url | `RewardsDirectAdapter` | `(url)` | Fetch Fuul claimed/unclaimed totals |
| `queryFuulClaimChecks` | url | `RewardsDirectAdapter` | `(url, body)` | Fetch Fuul claim payloads |
| `queryV3RewardsBreakdown` | url | `RewardsV3Adapter` | `(chainId, account, vault?)` | Fetch per-user V3 reward breakdown rows |

### Intrinsic APY Service

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryV3IntrinsicApy` | url | `IntrinsicApyV3Adapter` | `({ chainId, assetAddress })` | Fetch a single asset intrinsic APY; concurrent calls are backend-bundled via `assets=` |

### Plugins

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryBatchSimulation` | rpc | `BatchSimulationAdapter` | `(provider, evcAddress, calldata, value)` | Execute EVC batchSimulation via eth_call |
| `queryPythUpdateData` | url | `PythPluginAdapter` | `(feedIds)` | Fetch Pyth price update data from Hermes API (auto-bundled) |
| `queryPythUpdateFee` | rpc | `PythPluginAdapter` | `(provider, pythAddress, updateData)` | Read Pyth update fee from on-chain contract |
| `queryKeyringCheckCredential` | rpc | `KeyringPluginAdapter` | `(provider, hookTarget, account)` | Check keyring credential validity |
| `queryKeyringPolicyId` | rpc | `KeyringPluginAdapter` | `(provider, hookTarget)` | Read vault's keyring policy ID |
| `queryKeyringAddress` | rpc | `KeyringPluginAdapter` | `(provider, hookTarget)` | Read keyring contract address from vault |

### Not Wrapped (Internal Utilities)

The state override utilities (`getBalanceOverrides`, `getApprovalOverrides` in `src/utils/stateOverrides/`) make direct RPC calls for storage slot discovery. These are intentionally outside the `query*` pattern — they are internal simulation helpers, not data queries, and their results are not meaningful to cache.
