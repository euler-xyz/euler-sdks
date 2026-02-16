# External Data Queries

All external data fetching in the SDK (RPC calls, subgraph queries, HTTP requests) goes through **injectable `query*` methods**. This lets consumers wrap every network call with caching, logging, profiling, or any other cross-cutting concern — without modifying SDK internals.

## How It Works

Every class that fetches external data defines its fetchers as arrow-function properties named `query*`:

```typescript
class EVaultOnchainAdapter {
  constructor(/* ... */, buildQuery?: BuildQueryFn) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  queryVaultInfoFull = async (provider, chainId, vault) => {
    // RPC call via viem
  };
}
```

At construction time, `applyBuildQuery` iterates all own properties starting with `"query"` and replaces each with `buildQuery(queryName, originalFn)`. The `BuildQueryFn` type:

```typescript
type BuildQueryFn = <T extends (...args: any[]) => Promise<any>>(
  queryName: string,
  fn: T,
) => T;
```

Pass `buildQuery` once when building the SDK — it propagates to every service and adapter:

```typescript
const sdk = await buildSDK({
  rpcUrls: { 1: 'https://...' },
  buildQuery: myBuildQueryFn,
  plugins: [createPythPlugin({ buildQuery: myBuildQueryFn })],
})
```

## React Example — Wrapping Queries with react-query Cache

The `react-sdk-example` shows how to use `buildQuery` to give every SDK network call its own react-query cache entry with per-query stale times.

### The `buildQuery` wrapper

```typescript
import { QueryClient } from "@tanstack/react-query";
import type { BuildQueryFn } from "euler-v2-sdk";

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
  queryEulerLabelsVaults: Infinity,
  queryEulerLabelsEntities: Infinity,
  queryEulerLabelsProducts: Infinity,
  queryEulerLabelsPoints: Infinity,

  // Perspective / factory lists — change only when new vaults are deployed
  queryVerifiedArray: 5 * MINUTE,
  queryEulerEarnVerifiedArray: 5 * MINUTE,
  queryVaultFactories: 5 * MINUTE,

  // On-chain vault state — moderate refresh
  queryVaultInfoFull: 20_000,
  queryEulerEarnVaultInfoFull: 20_000,
  queryVaultInfoERC4626: 20_000,

  // Vault config — slow-changing
  queryGovernorAdmin: 60 * MINUTE,
  querySupplyCapResolved: 60 * MINUTE,

  // Prices
  queryAssetPriceInfo: MINUTE,
  queryPricesBatch: MINUTE,

  // Swap quotes — very short-lived
  querySwapQuotes: 10_000,

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
import { buildSDK, createPythPlugin } from "euler-v2-sdk";
import { sdkBuildQuery, queryClient } from "./sdkQueries";

// In a React component/provider:
const sdk = await buildSDK({
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

| Query | Class | Description |
|-------|-------|-------------|
| `queryDeployments` | `DeploymentService` (static) | Fetch deployment addresses from URL |
| `queryABI` | `ABIService` | Fetch ABI JSON from URL |
| `queryTokenList` | `TokenlistService` | Fetch token list from URL |
| `querySwapQuotes` | `SwapService` | Fetch swap quotes from aggregator API |

### Vault Adapters

| Query | Class | Description |
|-------|-------|-------------|
| `queryVaultInfoFull` | `EVaultOnchainAdapter` | Read full vault state via VaultLens |
| `queryVerifiedArray` | `EVaultOnchainAdapter` | Read verified vault list from Perspective |
| `queryEulerEarnVaultInfoFull` | `EulerEarnOnchainAdapter` | Read EulerEarn vault state via EulerEarnVaultLens |
| `queryEulerEarnVerifiedArray` | `EulerEarnOnchainAdapter` | Read verified EulerEarn vault list |
| `queryVaultInfoERC4626` | `SecuritizeVaultOnchainAdapter` | Read ERC4626 vault info |
| `queryGovernorAdmin` | `SecuritizeVaultOnchainAdapter` | Read governor admin address |
| `querySupplyCapResolved` | `SecuritizeVaultOnchainAdapter` | Read resolved supply cap |
| `queryVaultFactories` | `VaultTypeSubgraphAdapter` | Query vault factory data from subgraph |

### Account Adapters

| Query | Class | Description |
|-------|-------|-------------|
| `queryEVCAccountInfo` | `AccountOnchainAdapter` | Read EVC account state (controllers, collaterals) |
| `queryVaultAccountInfo` | `AccountOnchainAdapter` | Read per-vault account position |
| `queryVaultInfoFull` | `AccountOnchainAdapter` | Read vault info for account context |
| `queryAccountVaults` | `AccountVaultsSubgraphAdapter` | Query account vault history from subgraph |

### Wallet Adapter

| Query | Class | Description |
|-------|-------|-------------|
| `queryBalanceOf` | `WalletOnchainAdapter` | Read ERC20 balance |
| `queryAllowance` | `WalletOnchainAdapter` | Read ERC20 allowance |
| `queryPermit2Allowance` | `WalletOnchainAdapter` | Read Permit2 allowance |

### Price Service

| Query | Class | Description |
|-------|-------|-------------|
| `queryAssetPriceInfo` | `PriceService` | Read on-chain oracle price for an asset |
| `queryPricesBatch` | `PricingBackendClient` | Batch-fetch prices from pricing backend |

### Labels Service

| Query | Class | Description |
|-------|-------|-------------|
| `queryEulerLabelsVaults` | `EulerLabelsURLAdapter` | Fetch vault labels from Euler API |
| `queryEulerLabelsEntities` | `EulerLabelsURLAdapter` | Fetch entity labels from Euler API |
| `queryEulerLabelsProducts` | `EulerLabelsURLAdapter` | Fetch product labels from Euler API |
| `queryEulerLabelsPoints` | `EulerLabelsURLAdapter` | Fetch points labels from Euler API |

### Rewards Service

| Query | Class | Description |
|-------|-------|-------------|
| `queryMerklOpportunities` | `RewardsService` | Fetch Merkl reward opportunities |
| `queryBrevisCampaigns` | `RewardsService` | Fetch Brevis reward campaigns |

### Plugins

| Query | Class | Description |
|-------|-------|-------------|
| `queryBatchSimulation` | `BatchSimulationAdapter` | Execute EVC batchSimulation via eth_call |
| `queryPythUpdateData` | `PythPluginAdapter` | Fetch Pyth price update data from Hermes API |
| `queryPythUpdateFee` | `PythPluginAdapter` | Read Pyth update fee from on-chain contract |
| `queryCheckCredential` | `KeyringPluginAdapter` | Check keyring credential validity |
| `queryPolicyId` | `KeyringPluginAdapter` | Read vault's keyring policy ID |
| `queryKeyringAddress` | `KeyringPluginAdapter` | Read keyring contract address from vault |

### Not Wrapped (Internal Utilities)

The state override utilities (`getBalanceOverrides`, `getApprovalOverrides` in `src/utils/stateOverrides/`) make direct RPC calls for storage slot discovery. These are intentionally outside the `query*` pattern — they are internal simulation helpers, not data queries, and their results are not meaningful to cache.
