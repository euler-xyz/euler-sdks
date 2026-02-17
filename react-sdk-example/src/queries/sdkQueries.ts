import { QueryClient, useQuery } from "@tanstack/react-query";
import type { BuildQueryFn, VaultMetaPerspective, VaultRewardInfo } from "euler-v2-sdk";
import type { Address } from "viem";
import { useSDK } from "../context/SdkContext.tsx";
import { recordExecution } from "./queryProfileStore.ts";

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
  queryEulerLabelsPoints: Infinity,

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

  const wrapped = (...args: unknown[]) =>
    queryClient.fetchQuery({
      queryKey: ["sdk", queryName, ...args.map(serializeArg)],
      queryFn: () => {
        recordExecution(queryName);
        return fn(...args);
      },
      staleTime,
    });

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
        populateStrategyVaults: true,
        populateRewards: true,
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
        populateRewards: true,
        populateLabels: true,
      }),
    enabled: enabled && !!address,
    staleTime: 1_000,
  });
}

export function useEulerEarnDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["eulerEarn", chainId, address],
    queryFn: () =>
      sdk!.eulerEarnService.fetchVault(chainId, address as Address, {
        populateStrategyVaults: true,
        populateMarketPrices: true,
        populateRewards: true,
        populateLabels: true,
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
        populateMarketPrices: true,
        populateUserRewards: true,
        vaultFetchOptions: {
          populateMarketPrices: true,
          populateCollaterals: true,
          populateRewards: true,
        },
      }),
    enabled: enabled && !!address && address.length === 42,
    staleTime: 1_000,
  });
}

export function useChainRewards() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["chainRewards", chainId],
    queryFn: async () => {
      const map = await sdk!.rewardsService.getChainRewards(chainId);
      // Convert Map to a serialisable array for display
      const entries: { vaultAddress: string; info: VaultRewardInfo }[] = [];
      for (const [vaultAddress, info] of map) {
        entries.push({ vaultAddress, info });
      }
      entries.sort((a, b) => b.info.totalRewardsApr - a.info.totalRewardsApr);
      return entries;
    },
    enabled,
    staleTime: 60_000,
  });
}
