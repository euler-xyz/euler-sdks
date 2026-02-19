# Caching External Data Queries

All external data fetching in the SDK (RPC calls, subgraph queries, HTTP requests) goes through **injectable `query*` methods**. This lets consumers wrap every network call with caching, logging, profiling, or any other cross-cutting concern — without modifying SDK internals.

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

Pass `buildQuery` once when building the SDK — it propagates to every service and adapter:

```typescript
const sdk = await buildEulerSDK({
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
  queryEVaultVerifiedArray: 5 * MINUTE,
  queryEulerEarnVerifiedArray: 5 * MINUTE,
  queryVaultFactories: 5 * MINUTE,

  // On-chain vault state — moderate refresh
  queryEVaultInfoFull: 20_000,
  queryEulerEarnVaultInfoFull: 20_000,
  queryVaultInfoERC4626: 20_000,

  // Vault config — slow-changing
  querySecuritizeVaultGovernorAdmin: 60 * MINUTE,
  querySecuritizeVaultSupplyCapResolved: 60 * MINUTE,

  // Prices
  queryAssetPriceInfo: MINUTE,
  queryBackendPrice: MINUTE,

  // Swap quotes — very short-lived
  querySwapQuotes: 10_000,
  querySwapProviders: 60 * MINUTE, // providers rarely change

  // Pyth plugin — price update data is short-lived
  queryPythUpdateData: 10_000,
  queryPythUpdateFee: 30_000,

  // Intrinsic APY — external API data
  queryDefiLlamaPools: 5 * MINUTE,
  queryPendleMarketData: 5 * MINUTE,

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
import { buildEulerSDK, createPythPlugin } from "euler-v2-sdk";
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
| `queryEulerEarnVaultInfoFull` | rpc | `EulerEarnOnchainAdapter` | `(provider, lensAddress, vault)` | Read EulerEarn vault state via EulerEarnVaultLens |
| `queryEulerEarnVerifiedArray` | rpc | `EulerEarnOnchainAdapter` | `(provider, perspective)` | Read verified EulerEarn vault list |
| `queryVaultInfoERC4626` | rpc | `SecuritizeVaultOnchainAdapter` | `(provider, utilsLensAddress, vault)` | Read ERC4626 vault info |
| `querySecuritizeVaultGovernorAdmin` | rpc | `SecuritizeVaultOnchainAdapter` | `(provider, vault)` | Read governor admin address |
| `querySecuritizeVaultSupplyCapResolved` | rpc | `SecuritizeVaultOnchainAdapter` | `(provider, vault)` | Read resolved supply cap |
| `queryVaultFactories` | gql | `VaultTypeSubgraphAdapter` | `({ address, chainId })` | Fetch vault factory for a single vault (auto-bundled) |

### Account Adapters

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryEVCAccountInfo` | rpc | `AccountOnchainAdapter` | `(provider, accountLensAddress, evc, subAccount)` | Read EVC account state (controllers, collaterals) |
| `queryVaultAccountInfo` | rpc | `AccountOnchainAdapter` | `(provider, accountLensAddress, subAccount, vault)` | Read per-vault account position |
| `queryEVaultInfoFull` | rpc | `AccountOnchainAdapter` | `(provider, vaultLensAddress, vault)` | Read vault info for account context |
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
| `queryBackendPrice` | url | `PricingBackendClient` | `({ address, chainId })` | Fetch asset price from pricing backend (auto-bundled) |

### Labels Service

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryEulerLabelsVaults` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch vault labels from Euler API |
| `queryEulerLabelsEntities` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch entity labels from Euler API |
| `queryEulerLabelsProducts` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch product labels from Euler API |
| `queryEulerLabelsPoints` | url | `EulerLabelsURLAdapter` | `(url)` | Fetch points labels from Euler API |

### Rewards Service

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryMerklOpportunities` | url | `RewardsService` | `(url)` | Fetch Merkl reward opportunities |
| `queryBrevisCampaigns` | url | `RewardsService` | `(url, body)` | Fetch Brevis reward campaigns |
| `queryMerklUserRewards` | url | `RewardsService` | `(url)` | Fetch Merkl user reward balances |
| `queryBrevisUserProofs` | url | `RewardsService` | `(url, body)` | Fetch Brevis user reward proofs |

### Intrinsic APY Service

| Query | Type | Class | Args | Description |
|-------|------|-------|------|-------------|
| `queryDefiLlamaPools` | url | `IntrinsicApyService` | `(url)` | Fetch yield pool data from DefiLlama |
| `queryPendleMarketData` | url | `IntrinsicApyService` | `(url)` | Fetch market data from Pendle API |

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
