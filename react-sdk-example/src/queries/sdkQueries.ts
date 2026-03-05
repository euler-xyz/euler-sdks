import { QueryClient, useQuery } from "@tanstack/react-query";
import type {
  Account,
  BuildQueryFn,
  EVault,
  EulerEarn,
  Wallet,
  VaultEntity,
  VaultMetaPerspective,
  VaultRewardInfo,
} from "euler-v2-sdk";
import { isAddress, type Address } from "viem";
import { useSDK } from "../context/SdkContext.tsx";
import { recordExecution, registerKnownQueries } from "./queryProfileStore.ts";
import { interceptSdkDataIfEnabled } from "./dataInterceptorStore.ts";

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
// Every SDK `query*` method (queryEVaultInfoFull, queryEVaultVerifiedArray, …) is
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
  queryEVaultVerifiedArray: 5 * MINUTE,
  queryEulerEarnVerifiedArray: 5 * MINUTE,
  queryVaultFactories: 5 * MINUTE,

  // On-chain vault state — moderate refresh
  queryEVaultInfoFull: 20_000,
  queryEulerEarnVaultInfoFull: 20_000,
  queryVaultInfoERC4626: 20_000,
  
  // Vault config, probably ok to be cached for a while
  querySecuritizeVaultGovernorAdmin: 60 * MINUTE,
  querySecuritizeVaultSupplyCapResolved: 60 * MINUTE,

  // Prices
  queryAssetPriceInfo: MINUTE,
  queryBackendPrice: MINUTE,

  // Swap quotes — very short-lived
  querySwapQuotes: 10_000,
  querySwapProviders: 60 * MINUTE,

  // Pyth plugin — price update data is short-lived
  queryPythUpdateData: 10_000,
  queryPythUpdateFee: 30_000,

  // Rewards — external API data
  queryMerklOpportunities: 5 * MINUTE,
  queryBrevisCampaigns: 5 * MINUTE,
  queryMerklUserRewards: MINUTE,
  queryBrevisUserProofs: MINUTE,

  // Intrinsic APY — external API data
  queryDefiLlamaPools: 5 * MINUTE,
  queryPendleMarketData: 5 * MINUTE,

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

registerKnownQueries(Object.keys(STALE_TIMES));

function withDataInterceptor(
  queryName: string,
  fetcher: (...args: unknown[]) => Promise<unknown>
) {
  return async (...args: unknown[]) => {
    const data = await fetcher(...args);
    return interceptSdkDataIfEnabled(queryName, data);
  };
}

export const sdkBuildQuery: BuildQueryFn = (queryName, fn, target) => {
  const staleTime = STALE_TIMES[queryName] ?? DEFAULT_STALE_TIME;
  const interceptedFetcher = withDataInterceptor(queryName, (...args) =>
    fn(...args)
  );

  const wrapped = (...args: unknown[]) =>
    queryClient.fetchQuery({
      queryKey: ["sdk", queryName, ...args.map(serializeArg)],
      queryFn: async () => {
        recordExecution(queryName);
        const result = await interceptedFetcher(...args);
        // react-query treats undefined as missing data — use null instead
        return result === undefined ? null : result;
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

export type DiagnosticIssue = {
  severity?: "info" | "warning" | "error";
  code?: string;
  path?: string;
  message?: string;
  source?: string;
  entityId?: string;
  originalValue?: unknown;
};

export type OracleAdapterMetadataMap = Record<
  string,
  {
    address: string;
    provider?: string;
    methodology?: string;
    label?: string;
    name?: string;
    checks?: Array<{ id?: string; pass?: boolean; [key: string]: unknown }>;
    [key: string]: unknown;
  }
>;

type MaybeServiceResult<T> = T | { result: T; errors?: DiagnosticIssue[] };

function isServiceResult<T>(value: MaybeServiceResult<T>): value is { result: T; errors?: DiagnosticIssue[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "result" in value
  );
}

function issueLabel(issue: DiagnosticIssue): string {
  return `${issue.code ?? "UNKNOWN"} [${issue.severity ?? "warning"}] ${issue.path ?? "$"}`;
}

function parseDiagnosticPath(path: string | undefined): Array<string | number> {
  if (!path || !path.startsWith("$")) return [];
  const segments: Array<string | number> = [];
  const pattern = /\.([A-Za-z0-9_$]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(path)) !== null) {
    if (match[1]) {
      segments.push(match[1]);
      continue;
    }
    if (match[2]) {
      segments.push(Number(match[2]));
    }
  }

  return segments;
}

function getOwnerForDiagnosticPath(root: unknown, path: string | undefined): unknown {
  const segments = parseDiagnosticPath(path);
  if (segments.length === 0) return root;
  const ownerSegments = segments.slice(0, -1);

  let cursor: unknown = root;
  for (const segment of ownerSegments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[String(segment)];
  }

  return cursor;
}

export function unwrapServiceResultWithDiagnostics<T>(
  operation: string,
  response: MaybeServiceResult<T>
): { result: T; diagnostics: DiagnosticIssue[] } {
  if (!isServiceResult(response)) {
    return { result: response, diagnostics: [] };
  }

  const diagnostics = response.errors ?? [];
  const diagnosticsWithOwner = diagnostics.map((issue) => ({
    ...issue,
    ownerRef: getOwnerForDiagnosticPath(response.result, issue.path),
  }));
  console.log(`[sdk service result] ${operation}`, {
    result: response.result,
    errors: diagnosticsWithOwner,
  });

  const blocking = diagnostics.filter((issue) => issue.severity === "error");
  if (blocking.length > 0) {
    const preview = blocking.slice(0, 3).map(issueLabel).join("; ");
    throw new Error(
      `${operation} returned ${blocking.length} blocking diagnostics: ${preview}`
    );
  }

  if (diagnostics.length > 0) {
    console.warn(
      `[sdk diagnostics] ${operation}: ${diagnostics.length} non-blocking issue(s)`,
      diagnosticsWithOwner
    );
  }

  return { result: response.result, diagnostics };
}

export type FailedVaultFetch = {
  address: string;
  details: string;
};

function extractVaultIndex(path: string | undefined): number | undefined {
  if (!path) return undefined;
  const match = path.match(/^\$\.vaults\[(\d+)\]/);
  if (!match) return undefined;
  return Number(match[1]);
}

function formatIssueRaw(issue: DiagnosticIssue): string {
  return JSON.stringify(issue, null, 2);
}

function buildFailedVaultFetches(diagnostics: DiagnosticIssue[]): FailedVaultFetch[] {
  const byAddress = new Map<string, string[]>();

  for (const issue of diagnostics) {
    if (!issue.entityId || !isAddress(issue.entityId)) continue;

    const msg = issue.message ?? issue.code ?? "Vault fetch failed";
    const address = issue.entityId;

    const entries = byAddress.get(address) ?? [];
    entries.push(msg);
    byAddress.set(address, entries);
  }

  return Array.from(byAddress.entries()).map(([address, messages]) => ({
    address,
    details: Array.from(new Set(messages)).join("\n"),
  }));
}

export function unwrapServiceResult<T>(
  operation: string,
  response: MaybeServiceResult<T>
): T {
  return unwrapServiceResultWithDiagnostics(operation, response).result;
}

export function useVerifiedVaults(perspectives: VaultMetaPerspective[]) {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery<VaultEntity[]>({
    queryKey: ["vaults", chainId, perspectives],
    queryFn: async () => {
      const fetched = unwrapServiceResultWithDiagnostics(
        "vaultMetaService.fetchVerifiedVaults",
        await sdk!.vaultMetaService.fetchVerifiedVaults(chainId, perspectives, {
          populateAll: true,
        })
      );
      return (fetched.result as Array<VaultEntity | undefined>).filter(
        (vault): vault is VaultEntity => vault !== undefined
      );
    },
    enabled,
    staleTime: 1_000,
  });
}

export function useVerifiedVaultsWithDiagnostics(
  perspectives: VaultMetaPerspective[]
) {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery<{
    vaults: VaultEntity[];
    diagnostics: DiagnosticIssue[];
    failedVaults: FailedVaultFetch[];
    vaultErrorDetailsByAddress: Record<string, string>;
  }>({
    queryKey: ["vaultsWithDiagnostics", chainId, perspectives],
    queryFn: async () => {
      const fetched = unwrapServiceResultWithDiagnostics(
        "vaultMetaService.fetchVerifiedVaults",
        await sdk!.vaultMetaService.fetchVerifiedVaults(chainId, perspectives, {
          populateAll: true,
        })
      );
      const rawVaults = fetched.result as Array<VaultEntity | undefined>;
      const vaults = rawVaults.filter(
        (vault): vault is VaultEntity => vault !== undefined
      );
      const rowIssuesByAddress = new Map<string, DiagnosticIssue[]>();
      const failedIssuesByAddress = new Map<string, DiagnosticIssue[]>();

      for (const issue of fetched.diagnostics) {
        const vaultIndex = extractVaultIndex(issue.path);

        if (vaultIndex !== undefined) {
          const rowVault = rawVaults[vaultIndex];
          if (rowVault) {
            const key = rowVault.address.toLowerCase();
            const list = rowIssuesByAddress.get(key) ?? [];
            list.push(issue);
            rowIssuesByAddress.set(key, list);
            continue;
          }

          if (issue.entityId && isAddress(issue.entityId)) {
            const key = issue.entityId.toLowerCase();
            const list = failedIssuesByAddress.get(key) ?? [];
            list.push(issue);
            failedIssuesByAddress.set(key, list);
          }
          continue;
        }
      }

      const vaultErrorDetailsByAddress = Object.fromEntries(
        Array.from(rowIssuesByAddress.entries()).map(([address, issues]) => [
          address,
          issues.map(formatIssueRaw).join("\n\n"),
        ])
      );
      const failedVaults = Array.from(failedIssuesByAddress.entries()).map(([address, issues]) => ({
        address,
        details: issues.map(formatIssueRaw).join("\n\n"),
      }));

      return {
        vaults,
        diagnostics: fetched.diagnostics,
        failedVaults,
        vaultErrorDetailsByAddress,
      };
    },
    enabled,
    staleTime: 1_000,
  });
}

export function useVaultDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<EVault>({
    queryKey: ["vault", chainId, address],
    queryFn: async () =>
      unwrapServiceResult(
        "eVaultService.fetchVault",
        await sdk!.eVaultService.fetchVault(chainId, address as Address, {
          populateAll: true,
        })
      ),
    enabled: enabled && !!address,
    staleTime: 1_000,
  });
}

export function useVaultDetailWithDiagnostics(
  chainId: number,
  address: string | undefined
) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<{
    vault?: EVault;
    diagnostics: DiagnosticIssue[];
    failedVaults: FailedVaultFetch[];
  }>({
    queryKey: ["vaultWithDiagnostics", chainId, address],
    queryFn: async () => {
      try {
        const fetched = unwrapServiceResultWithDiagnostics(
          "eVaultService.fetchVault",
          await sdk!.eVaultService.fetchVault(chainId, address as Address, {
            populateAll: true,
          })
        );
        return {
          vault: fetched.result,
          diagnostics: fetched.diagnostics,
          failedVaults: buildFailedVaultFetches(fetched.diagnostics),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const diagnostics: DiagnosticIssue[] = [{
          code: "SOURCE_UNAVAILABLE",
          severity: "error",
          message,
          path: "$",
          source: "eVaultService.fetchVault",
          entityId: address,
          originalValue: address,
        }];
        return {
          vault: undefined,
          diagnostics,
          failedVaults: buildFailedVaultFetches(diagnostics),
        };
      }
    },
    enabled: enabled && !!address,
    staleTime: 1_000,
  });
}

export function useEulerEarnDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<EulerEarn>({
    queryKey: ["eulerEarn", chainId, address],
    queryFn: async () =>
      unwrapServiceResult(
        "eulerEarnService.fetchVault",
        await sdk!.eulerEarnService.fetchVault(chainId, address as Address, {
          populateAll: true,
        })
      ),
    enabled: enabled && !!address,
    staleTime: 1_000,
  });
}

export function useAccount(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<Account>({
    queryKey: ["account", chainId, address],
    queryFn: async () =>
      unwrapServiceResult(
        "accountService.fetchAccount",
        await sdk!.accountService.fetchAccount(chainId, address as Address, {
          populateAll: true,
          vaultFetchOptions: {
            populateAll: true,
          },
        })
      ),
    enabled: enabled && !!address && address.length === 42,
    staleTime: 1_000,
  });
}

export function useAccountWithDiagnostics(
  chainId: number,
  address: string | undefined
) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<{
    account: Account;
    diagnostics: DiagnosticIssue[];
    failedVaults: FailedVaultFetch[];
  }>({
    queryKey: ["accountWithDiagnostics", chainId, address],
    queryFn: async () => {
      const fetched = unwrapServiceResultWithDiagnostics(
        "accountService.fetchAccount",
        await sdk!.accountService.fetchAccount(chainId, address as Address, {
          populateAll: true,
          vaultFetchOptions: {
            populateAll: true,
          },
        })
      );

      return {
        account: fetched.result,
        diagnostics: fetched.diagnostics,
        failedVaults: buildFailedVaultFetches(fetched.diagnostics),
      };
    },
    enabled: enabled && !!address && address.length === 42,
    staleTime: 1_000,
  });
}

export function useWalletBalance(
  chainId: number,
  account: string | undefined,
  assetAddress: string | undefined
) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<bigint | undefined>({
    queryKey: ["walletBalance", chainId, account, assetAddress],
    queryFn: async () => {
      const wallet = unwrapServiceResult(
        "walletService.fetchWallet",
        await sdk!.walletService.fetchWallet(chainId, account as Address, [
          { asset: assetAddress as Address, spenders: [] },
        ])
      ) as Wallet;
      return wallet.getBalance(assetAddress as Address);
    },
    enabled: enabled && !!account && !!assetAddress,
    staleTime: 5_000,
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

export function useOracleAdapterMetadataMap(chainId: number) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<OracleAdapterMetadataMap>({
    queryKey: ["oracleAdapterMetadataMap", chainId],
    queryFn: async () => sdk!.oracleAdapterService.getOracleAdapterMap(chainId),
    enabled: enabled && Number.isFinite(chainId),
    staleTime: 10 * MINUTE,
  });
}
