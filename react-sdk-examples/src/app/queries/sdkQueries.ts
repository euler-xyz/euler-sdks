"use client";

import { QueryClient, useQuery } from "@tanstack/react-query";
import type { BuildQueryFn, VaultMetaPerspective } from "euler-v2-sdk";
import type { Address } from "viem";
import { useSDK } from "../context/SdkContext";

// ---------------------------------------------------------------------------
// Query client
// ---------------------------------------------------------------------------

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

const ENABLE_SDK_QUERY_LOGS = process.env.NODE_ENV === "development";

const loggerGlobal = globalThis as typeof globalThis & {
  __sdkQueryLoggerAttached?: boolean;
};

if (
  typeof window !== "undefined" &&
  ENABLE_SDK_QUERY_LOGS &&
  !loggerGlobal.__sdkQueryLoggerAttached
) {
  loggerGlobal.__sdkQueryLoggerAttached = true;
  queryClient.getQueryCache().subscribe((event) => {
    const query = event?.query;
    if (!query) return;

    const [scope] = query.queryKey;
    if (scope !== "sdk") return;

    console.log("[rq:sdk]", event.type, query.queryKey, {
      status: query.state.status,
      fetchStatus: query.state.fetchStatus,
      dataUpdatedAt: query.state.dataUpdatedAt,
    });
  });
}

// ---------------------------------------------------------------------------
// Layer 1 – Fetcher-level caching via SDK's buildQuery hook
//
// Every SDK `query*` method (queryVaultInfoFull, queryVerifiedArray, …) is
// wrapped with queryClient.fetchQuery() so each individual RPC / subgraph
// call gets its own React-Query cache entry.
// ---------------------------------------------------------------------------

function serializeArg(arg: unknown): unknown {
  if (typeof arg === "bigint") return `bigint:${arg.toString()}`;

  // viem PublicClient – use its chain id as identity
  if (
    arg !== null &&
    typeof arg === "object" &&
    "chain" in arg &&
    "transport" in arg
  ) {
    const client = arg as { chain?: { id: number } };
    return `client:${client.chain?.id ?? "unknown"}`;
  }

  return arg;
}

const MINUTE = 60_000;

const STALE_TIMES: Record<string, number> = {
  // Static metadata — essentially never changes
  queryDeployments: Infinity,
  queryABI: Infinity,
  queryTokenList: Infinity,
  queryEulerLabelsVaults: Infinity,
  queryEulerLabelsEntities: Infinity,
  queryEulerLabelsProducts: Infinity,

  // Perspective / factory lists — change only when new vaults are deployed
  queryVerifiedArray: 5 * MINUTE,
  queryEulerEarnVerifiedArray: 5 * MINUTE,
  queryVaultFactories: 5 * MINUTE,

  // On-chain vault state — moderate refresh
  queryVaultInfoFull: 20_000,
  queryEulerEarnVaultInfoFull: 20_000,
  queryVaultInfoERC4626: 20_000,

  // Vault config, probably ok to be cached for a while
  queryGovernorAdmin: 60 * MINUTE,
  querySupplyCapResolved: 60 * MINUTE,

  // Prices
  queryAssetPriceInfo: MINUTE,
  queryPricesBatch: MINUTE,

  // Swap quotes — very short-lived
  querySwapQuotes: 10_000,

  // Account / subgraph lookups — moderate
  queryAccountVaults: 30_000,

  // Per-user on-chain state — changes on every tx
  queryEVCAccountInfo: 15_000,
  queryVaultAccountInfo: 15_000,
  queryBalanceOf: 15_000,
  queryAllowance: 15_000,
  queryPermit2Allowance: 15_000,
};

const DEFAULT_STALE_TIME = MINUTE;

export const sdkBuildQuery: BuildQueryFn = (queryName, fn) => {
  const staleTime = STALE_TIMES[queryName] ?? DEFAULT_STALE_TIME;

  const wrapped = (...args: unknown[]) => {
    const queryKey = ["sdk", queryName, ...args.map(serializeArg)];
    const stateBefore = queryClient.getQueryState(queryKey);
    const isFresh =
      !!stateBefore?.dataUpdatedAt &&
      (staleTime === Infinity ||
        Date.now() - stateBefore.dataUpdatedAt < staleTime);

    if (ENABLE_SDK_QUERY_LOGS) {
      console.log(
        `[rq:sdk] request ${queryName} (${isFresh ? "cache-hit" : "cache-miss"})`,
        queryKey,
      );
    }

    return queryClient.fetchQuery({
      queryKey,
      queryFn: () => {
        if (ENABLE_SDK_QUERY_LOGS) {
          console.log(`[rq:sdk] execute ${queryName}`, queryKey);
        }
        return fn(...args);
      },
      staleTime,
    });
  };

  return wrapped as typeof fn;
};

// ---------------------------------------------------------------------------
// Layer 3 – UI-level reactive hooks
//
// These provide the reactive boundary only. The SDK service methods
// (fetchVerifiedVaults, fetchVault, …) act as Layer 2 "mappers" that
// orchestrate already-cached fetchers. Re-running a mapper is cheap — it
// only triggers real network calls when a fetcher's own staleTime expires.
// ---------------------------------------------------------------------------

function useSdkReady() {
  const ctx = useSDK();
  return { ...ctx, enabled: !!ctx.sdk };
}

export function useVerifiedVaults(perspectives: VaultMetaPerspective[]) {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["vaults", chainId, perspectives],
    queryFn: () =>
      sdk!.vaultMetaService.fetchVerifiedVaults(chainId, perspectives, {
        populateMarketPrices: true,
      }),
    enabled,
    staleTime: 1_000,
  });
}

export function useVaultDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["vault", chainId, address],
    queryFn: () =>
      sdk!.eVaultService.fetchVault(chainId, address as Address, {
        populateCollaterals: true,
        populateMarketPrices: true,
      }),
    enabled: enabled && !!address,
    staleTime: 1_000,
  });
}

export function useEulerEarnDetail(
  chainId: number,
  address: string | undefined,
) {
  const { sdk, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["eulerEarn", chainId, address],
    queryFn: () =>
      sdk!.eulerEarnService.fetchVault(chainId, address as Address, {
        populateMarketPrices: true,
      }),
    enabled: enabled && !!address,
    staleTime: 1_000,
  });
}

export function useAccount(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["account", chainId, address],
    queryFn: () =>
      sdk!.accountService.fetchAccount(chainId, address as Address, {
        populateVaults: true,
      }),
    enabled: enabled && !!address && address.length === 42,
    staleTime: 1_000,
  });
}
