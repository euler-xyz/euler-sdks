import {
  QueryClient,
  useQuery,
  type FetchQueryOptions,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  Account,
  BuildQueryFn,
  EulerSDKQueryName,
  EVault,
  EulerSDK,
  EulerEarn,
  FeeFlowState,
  Wallet,
  VaultEntity,
  VaultRewardInfo,
} from "@eulerxyz/euler-v2-sdk";
import { getAddress, isAddress, type Address } from "viem";
import { useSDK } from "../context/SdkContext.tsx";
import { recordExecution, recordFailure, registerKnownQueries } from "./queryProfileStore.ts";
import { interceptSdkDataIfEnabled, isQueryIntercepted } from "./dataInterceptorStore.ts";
import { getQueryBuildOverrides, useEnabledChainIds } from "./queryOptionsStore.ts";
import { isEVault } from "@eulerxyz/euler-v2-sdk";
import { CHAIN_NAMES, EARN_CHAIN_IDS, SECURITIZE_VAULT_ADDRESSES } from "../config/chains.ts";

type SecuritizeVault = NonNullable<
  Awaited<ReturnType<EulerSDK["securitizeVaultService"]["fetchVaults"]>>["result"][number]
>;

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
const EULER_LABELS_BASE =
  "https://raw.githubusercontent.com/euler-xyz/euler-labels/refs/heads/master";

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
  queryV3EVaultList: 5 * MINUTE,
  queryV3EulerEarnList: 5 * MINUTE,
  queryV3VaultResolve: 5 * MINUTE,

  // On-chain vault state — moderate refresh
  queryEVaultInfoFull: 20_000,
  queryEulerEarnVaultInfoFull: 20_000,
  queryEulerEarnConvertToAssets: 20_000,
  queryBlockNumber: 10_000,
  queryBlock: 10_000,
  queryVaultInfoERC4626: 20_000,
  queryV3EVaultDetail: 20_000,
  queryV3EulerEarnDetail: 20_000,
  
  // Vault config, probably ok to be cached for a while
  querySecuritizeVaultGovernorAdmin: 60 * MINUTE,
  querySecuritizeVaultSupplyCapResolved: 60 * MINUTE,
  queryKeyringPolicyId: 60 * MINUTE,
  queryKeyringAddress: 60 * MINUTE,

  // Prices
  queryAssetPriceInfo: MINUTE,
  queryV3Price: MINUTE,

  // Simulations and quote-like reads — short-lived
  queryBatchSimulation: 10_000,

  // Swap quotes — very short-lived
  querySwapQuotes: 10_000,
  querySwapProviders: 60 * MINUTE,

  // Pyth plugin — price update data is short-lived
  queryPythUpdateData: 10_000,
  queryPythUpdateFee: 30_000,

  // Rewards — external API data
  queryMerklOpportunities: 5 * MINUTE,
  queryBrevisCampaigns: 5 * MINUTE,
  queryFuulIncentives: 5 * MINUTE,
  queryMerklUserRewards: MINUTE,
  queryBrevisUserProofs: MINUTE,
  queryFuulTotals: MINUTE,
  queryFuulClaimChecks: MINUTE,
  queryV3RewardsBreakdown: MINUTE,

  // Intrinsic APY — external API data
  queryV3IntrinsicApy: 5 * MINUTE,

  // Account / subgraph lookups — moderate
  queryV3AccountPositions: 30_000,
  queryAccountVaults: 30_000,

  // Static-ish external metadata
  queryOracleAdapters: 10 * MINUTE,

  // Per-user on-chain state — changes on every tx
  queryEVCAccountInfo: 15_000,
  queryVaultAccountInfo: 15_000,
  queryBalanceOf: 15_000,
  queryAllowance: 15_000,
  queryPermit2Allowance: 15_000,
  queryKeyringCheckCredential: 15_000,

  // UI hook queries
  vaults: 10_000,
  vaultsWithDiagnostics: 10_000,
  vault: 10_000,
  vaultWithDiagnostics: 10_000,
  eulerEarn: 10_000,
  account: 10_000,
  accountWithDiagnostics: 10_000,
  walletBalance: 5_000,
  chainRewards: 60_000,
  oracleAdapterMetadataMap: 10 * MINUTE,
  tokenSymbolMap: Infinity,
  feeFlowPageData: 15_000,
};

const DEFAULT_STALE_TIME = MINUTE;
function withDataInterceptor(
  queryName: string,
  fetcher: (...args: unknown[]) => Promise<unknown>
) {
  return async (...args: unknown[]) => {
    const data = await fetcher(...args);
    return interceptSdkDataIfEnabled(queryName, data);
  };
}

export const sdkBuildQuery: BuildQueryFn = (queryName, fn) => {
  const staleTime = STALE_TIMES[queryName as EulerSDKQueryName] ?? DEFAULT_STALE_TIME;
  registerKnownQueries([queryName]);
  const interceptedFetcher = withDataInterceptor(queryName, (...args) =>
    fn(...args)
  );

  const wrapped = async (...args: unknown[]) => {
    recordExecution(queryName);
    const queryKey = ["sdk", queryName, ...args.map(serializeArg)] as QueryKey;
    const { disableCache, fetchQueryOptions: overrides } = getQueryBuildOverrides();

    const fetchOptions: FetchQueryOptions<unknown, Error, unknown, QueryKey> = {
      queryKey,
      queryFn: async () => {
        const result = await interceptedFetcher(...args);
        // react-query treats undefined as missing data — use null instead
        return result === undefined ? null : result;
      },
      staleTime,
      ...(overrides as Omit<
        FetchQueryOptions<unknown, Error, unknown, QueryKey>,
        "queryKey" | "queryFn"
      >),
      // When manually intercepting a query in the profiler, a "throw" should
      // fail that exact call path instead of being retried transparently.
      retry: isQueryIntercepted(queryName)
        ? false
        : (overrides.retry as FetchQueryOptions<
            unknown,
            Error,
            unknown,
            QueryKey
          >["retry"]),
    };

    try {
      return await queryClient.fetchQuery(fetchOptions);
    } catch (error) {
      recordFailure(queryName);
      throw error;
    } finally {
      if (disableCache) {
        queryClient.removeQueries({ queryKey, exact: true });
      }
    }
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

export type DiagnosticIssue = {
  severity?: "info" | "warning" | "error";
  code?: string;
  paths?: string[];
  message?: string;
  source?: string;
  entityId?: string;
  chainId?: number;
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

function getDiagnosticPaths(issue: DiagnosticIssue): string[] {
  return issue.paths?.length ? issue.paths : ["$"];
}

export function unwrapServiceResultWithDiagnostics<T>(
  _operation: string,
  response: MaybeServiceResult<T>
): { result: T; diagnostics: DiagnosticIssue[] } {
  if (!isServiceResult(response)) {
    return { result: response, diagnostics: [] };
  }

  const diagnostics = response.errors ?? [];
  return { result: response.result, diagnostics };
}

export type FailedVaultFetch = {
  address?: string;
  chainId?: number;
  chainName?: string;
  details: string;
};

export type ChainScopedVault<TVault extends VaultEntity> = TVault & {
  chainId: number;
  chainName: string;
};

export type FeeFlowCandidate = {
  vault: EVault;
  protocolFeesAssets: bigint;
  feeFlowAssets: bigint;
  claimableAssets: bigint;
  claimableValueUsd: bigint;
};

function extractVaultIndex(path: string | undefined): number | undefined {
  if (!path) return undefined;
  const match = path.match(/^\$\.(?:vaults|eVaults)\[(\d+)\]$/);
  if (!match) return undefined;
  return Number(match[1]);
}

function extractVaultIndexFromIssue(issue: DiagnosticIssue): number | undefined {
  return getDiagnosticPaths(issue)
    .map((path) => extractVaultIndex(path))
    .find((index): index is number => index !== undefined);
}

function isVaultFetchFailureIssue(issue: DiagnosticIssue): boolean {
  return issue.code === "SOURCE_UNAVAILABLE" && extractVaultIndexFromIssue(issue) !== undefined;
}

function formatIssueRaw(issue: DiagnosticIssue): string {
  return JSON.stringify(issue, null, 2);
}

function buildFailedVaultFetches(diagnostics: DiagnosticIssue[]): FailedVaultFetch[] {
  const byKey = new Map<string, FailedVaultFetch>();

  for (const issue of diagnostics) {
    if (!issue.entityId || !isAddress(issue.entityId)) continue;
    if (issue.code !== "SOURCE_UNAVAILABLE") continue;

    const msg = issue.message ?? issue.code ?? "Vault fetch failed";
    const chainId = issue.chainId;
    const key = `${chainId ?? "unknown"}:${issue.entityId.toLowerCase()}`;
    const existing = byKey.get(key);

    if (existing) {
      existing.details = Array.from(
        new Set([...existing.details.split("\n"), msg])
      ).join("\n");
      continue;
    }

    byKey.set(key, {
      address: issue.entityId,
      chainId,
      chainName: chainId !== undefined ? CHAIN_NAMES[chainId] : undefined,
      details: msg,
    });
  }

  return Array.from(byKey.values());
}

function resolveDiagnosticsWithFailedVaults<TVault extends VaultEntity>(
  rawVaults: Array<TVault | undefined>,
  fetchedDiagnostics: DiagnosticIssue[]
): VaultListDiagnosticsResult<TVault> {
  const vaults = rawVaults.filter((vault): vault is TVault => vault !== undefined);
  const loadedVaultAddresses = new Set(
    vaults.map((vault) => vault.address.toLowerCase())
  );
  const failedIssuesByAddress = new Map<string, DiagnosticIssue[]>();
  const diagnostics: DiagnosticIssue[] = fetchedDiagnostics.map((issue) => {
    if (issue.entityId && isAddress(issue.entityId)) return issue;

    const vaultIndex = extractVaultIndexFromIssue(issue);
    if (vaultIndex === undefined) return issue;

    const rowVault = rawVaults[vaultIndex];
    if (!rowVault) return issue;

    return { ...issue, entityId: rowVault.address };
  });

  for (const issue of diagnostics) {
    const vaultIndex = extractVaultIndexFromIssue(issue);
    const issueAddress = issue.entityId && isAddress(issue.entityId)
      ? issue.entityId.toLowerCase()
      : undefined;
    const addFailedIssue = () => {
      if (!issueAddress) return;
      const list = failedIssuesByAddress.get(issueAddress) ?? [];
      list.push(issue);
      failedIssuesByAddress.set(issueAddress, list);
    };

    if (vaultIndex !== undefined) {
      const rowVault = rawVaults[vaultIndex];
      if (rowVault) {
        if (
          issueAddress &&
          isVaultFetchFailureIssue(issue) &&
          rowVault.address.toLowerCase() !== issueAddress &&
          !loadedVaultAddresses.has(issueAddress)
        ) {
          addFailedIssue();
        }
        continue;
      }

      if (issueAddress && isVaultFetchFailureIssue(issue)) {
        addFailedIssue();
      }
      continue;
    }

    if (
      issueAddress &&
      isVaultFetchFailureIssue(issue) &&
      !loadedVaultAddresses.has(issueAddress)
    ) {
      addFailedIssue();
    }
  }

  const failedVaults = Array.from(failedIssuesByAddress.entries()).map(([address, issues]) => ({
    address,
    details: issues.map(formatIssueRaw).join("\n\n"),
  }));

  return {
    vaults,
    diagnostics,
    failedVaults,
  };
}

export function unwrapServiceResult<T>(
  operation: string,
  response: MaybeServiceResult<T>
): T {
  return unwrapServiceResultWithDiagnostics(operation, response).result;
}

export async function fetchVaultAddressesFromLabelProducts(
  sdk: EulerSDK,
  chainId: number
): Promise<Address[]> {
  const products = await sdk.eulerLabelsService.fetchEulerLabelsProducts(chainId);
  const seen = new Set<string>();
  const addresses: Address[] = [];

  for (const product of Object.values(products)) {
    for (const vault of product.vaults ?? []) {
      try {
        const normalized = getAddress(vault);
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push(normalized);
      } catch {
        continue;
      }
    }
  }

  return addresses;
}

export async function fetchEarnVaultAddressesFromLabels(
  chainId: number
): Promise<Address[]> {
  const response = await fetch(`${EULER_LABELS_BASE}/${chainId}/earn-vaults.json`);
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Failed to fetch Euler labels earn vaults: ${response.statusText}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) return [];

  const seen = new Set<string>();
  const addresses: Address[] = [];

  for (const entry of payload) {
    const rawAddress =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" &&
            entry !== null &&
            "address" in entry &&
            typeof entry.address === "string"
          ? entry.address
          : undefined;

    if (!rawAddress) continue;

    try {
      const normalized = getAddress(rawAddress);
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      addresses.push(normalized);
    } catch {
      continue;
    }
  }

  return addresses;
}

function logVaultFetchResults(
  kind: "eVault" | "eulerEarn" | "securitize",
  chainId: number,
  addresses: Address[],
  result: Array<VaultEntity | undefined>,
  diagnostics: DiagnosticIssue[]
) {
  console.log(`[react-sdk-example] ${kind} fetch`, {
    chainId,
    requestedCount: addresses.length,
    requestedAddresses: addresses,
    resolvedCount: result.filter((vault): vault is VaultEntity => vault !== undefined).length,
    resolvedVaults: result
      .filter((vault): vault is VaultEntity => vault !== undefined)
      .map((vault) => ({
        address: vault.address,
        name: vault.shares.name,
        symbol: vault.shares.symbol,
      })),
    missingAddresses: result
      .map((vault, index) => (vault === undefined ? addresses[index] : undefined))
      .filter((address): address is Address => address !== undefined),
    diagnostics,
  });
}

async function fetchLabeledVaultsWithDiagnostics(
  sdk: EulerSDK,
  chainId: number
) {
  const addresses = await fetchVaultAddressesFromLabelProducts(sdk, chainId);

  const res = unwrapServiceResultWithDiagnostics(
    "eVaultService.fetchVaults",
    await sdk.eVaultService.fetchVaults(chainId, addresses, {
      populateMarketPrices: true,
      populateRewards: true,
      populateIntrinsicApy: true,
      populateLabels: true,
    })
  );
  logVaultFetchResults("eVault", chainId, addresses, res.result as Array<VaultEntity | undefined>, res.diagnostics);
  return res;
}

async function fetchEulerEarnVaultsWithDiagnostics(
  sdk: EulerSDK,
  chainId: number
) {
  const addresses = await fetchEarnVaultAddressesFromLabels(chainId);

  const res = unwrapServiceResultWithDiagnostics(
    "eulerEarnService.fetchVaults",
    await sdk.eulerEarnService.fetchVaults(chainId, addresses, {
      populateMarketPrices: true,
      populateRewards: true,
      populateIntrinsicApy: true,
      populateStrategyVaults: true,
      populateLabels: true,
    })
  );
  logVaultFetchResults("eulerEarn", chainId, addresses, res.result as Array<VaultEntity | undefined>, res.diagnostics);
  return res;
}

async function fetchSecuritizeVaultsWithDiagnostics(
  sdk: EulerSDK,
  chainId: number
) {
  const addresses = SECURITIZE_VAULT_ADDRESSES[chainId] ?? [];

  const res = unwrapServiceResultWithDiagnostics(
    "securitizeVaultService.fetchVaults",
    await sdk.securitizeVaultService.fetchVaults(chainId, addresses, {
      populateMarketPrices: true,
      populateRewards: true,
      populateIntrinsicApy: true,
      populateLabels: true,
    })
  );
  logVaultFetchResults("securitize", chainId, addresses, res.result as Array<VaultEntity | undefined>, res.diagnostics);
  return res;
}

type VaultListDiagnosticsResult<TVault extends VaultEntity> = {
  vaults: TVault[];
  diagnostics: DiagnosticIssue[];
  failedVaults: FailedVaultFetch[];
};

type ChainFetchResult<TVault extends VaultEntity> = {
  vaults: ChainScopedVault<TVault>[];
  diagnostics: DiagnosticIssue[];
  failedVaults: FailedVaultFetch[];
};

function addChainMetadataToDiagnostics(
  diagnostics: DiagnosticIssue[],
  chainId: number
): DiagnosticIssue[] {
  return diagnostics.map((issue) => ({ ...issue, chainId }));
}

function addChainMetadataToFailedVaults(
  failedVaults: FailedVaultFetch[],
  chainId: number
): FailedVaultFetch[] {
  const chainName = CHAIN_NAMES[chainId] ?? String(chainId);
  return failedVaults.map((failed) => ({
    ...failed,
    chainId,
    chainName,
  }));
}

async function fetchAllChainsVaultDiagnostics<TVault extends VaultEntity>(
  chainIds: number[],
  fetcher: (chainId: number) => Promise<{
    result: Array<TVault | undefined>;
    diagnostics: DiagnosticIssue[];
  }>
): Promise<ChainFetchResult<TVault>> {
  const settled = await Promise.all(
    chainIds.map(async (chainId) => {
      const chainName = CHAIN_NAMES[chainId] ?? String(chainId);

      try {
        const fetched = await fetcher(chainId);
        const resolved = resolveDiagnosticsWithFailedVaults(
          fetched.result,
          addChainMetadataToDiagnostics(fetched.diagnostics, chainId)
        );

        return {
          vaults: resolved.vaults.map((vault) => ({
            ...vault,
            chainId,
            chainName,
          })),
          diagnostics: resolved.diagnostics,
          failedVaults: addChainMetadataToFailedVaults(resolved.failedVaults, chainId),
        } satisfies ChainFetchResult<TVault>;
      } catch (error) {
        return {
          vaults: [],
          diagnostics: [
            {
              code: "SOURCE_UNAVAILABLE",
              severity: "warning",
              source: "vaultList",
              chainId,
              message: `Failed to load vaults for ${chainName}.`,
              originalValue: error instanceof Error ? error.message : String(error),
            },
          ],
          failedVaults: [],
        } satisfies ChainFetchResult<TVault>;
      }
    })
  );

  return {
    vaults: settled.flatMap((item) => item.vaults),
    diagnostics: settled.flatMap((item) => item.diagnostics),
    failedVaults: settled.flatMap((item) => item.failedVaults),
  };
}

export function useAllVaults() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery<VaultEntity[]>({
    queryKey: ["vaults", chainId, "all"],
    queryFn: async () => {
      const fetched = await fetchLabeledVaultsWithDiagnostics(sdk!, chainId);
      const res = (fetched.result as Array<VaultEntity | undefined>).filter(
        (vault): vault is VaultEntity => vault !== undefined
      );
      return res;
    },
    enabled,
    staleTime: STALE_TIMES.vaults,
  });
}

export function useAllVaultsWithDiagnostics() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery<{
    vaults: VaultEntity[];
    diagnostics: DiagnosticIssue[];
    failedVaults: FailedVaultFetch[];
  }>({
    queryKey: ["vaultsWithDiagnostics", chainId, "all"],
    queryFn: async () => {
      const fetched = await fetchLabeledVaultsWithDiagnostics(sdk!, chainId);
      const rawVaults = fetched.result as Array<VaultEntity | undefined>;
      return resolveDiagnosticsWithFailedVaults(rawVaults, fetched.diagnostics);
    },
    enabled,
    staleTime: STALE_TIMES.vaultsWithDiagnostics,
  });
}

export function useLabeledEVaultsWithDiagnostics(enabledOverride = true) {
  const { sdk, enabled } = useSdkReady();
  const enabledChainIds = useEnabledChainIds();
  return useQuery<ChainFetchResult<EVault>>({
    queryKey: ["vaultsWithDiagnostics", "allChains", "evaults", enabledChainIds],
    queryFn: async () =>
      fetchAllChainsVaultDiagnostics<EVault>(enabledChainIds, (chainId) =>
        fetchLabeledVaultsWithDiagnostics(sdk!, chainId) as Promise<{
          result: Array<EVault | undefined>;
          diagnostics: DiagnosticIssue[];
        }>
      ),
    enabled: enabled && enabledOverride,
    staleTime: STALE_TIMES.vaultsWithDiagnostics,
  });
}

export function useAllEulerEarnVaultsWithDiagnostics(enabledOverride = true) {
  const { sdk, enabled } = useSdkReady();
  const enabledChainIds = useEnabledChainIds();
  const earnChainIds = enabledChainIds.filter((chainId) =>
    EARN_CHAIN_IDS.includes(chainId)
  );
  return useQuery<ChainFetchResult<EulerEarn>>({
    queryKey: ["vaultsWithDiagnostics", "allChains", "eulerEarns", earnChainIds],
    queryFn: async () =>
      fetchAllChainsVaultDiagnostics<EulerEarn>(earnChainIds, (chainId) =>
        fetchEulerEarnVaultsWithDiagnostics(sdk!, chainId) as Promise<{
          result: Array<EulerEarn | undefined>;
          diagnostics: DiagnosticIssue[];
        }>
      ),
    enabled: enabled && enabledOverride,
    staleTime: STALE_TIMES.vaultsWithDiagnostics,
  });
}

export function useSecuritizeVaultsWithDiagnostics(enabledOverride = true) {
  const { sdk, enabled } = useSdkReady();
  const enabledChainIds = useEnabledChainIds();
  const securitizeChainIds = enabledChainIds.filter(
    (chainId) => (SECURITIZE_VAULT_ADDRESSES[chainId]?.length ?? 0) > 0
  );
  return useQuery<ChainFetchResult<SecuritizeVault>>({
    queryKey: ["vaultsWithDiagnostics", "allChains", "securitize", securitizeChainIds],
    queryFn: async () =>
      fetchAllChainsVaultDiagnostics<SecuritizeVault>(securitizeChainIds, (chainId) =>
        fetchSecuritizeVaultsWithDiagnostics(sdk!, chainId) as Promise<{
          result: Array<SecuritizeVault | undefined>;
          diagnostics: DiagnosticIssue[];
        }>
      ),
    enabled: enabled && enabledOverride,
    staleTime: STALE_TIMES.vaultsWithDiagnostics,
  });
}

export function useVaultDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<EVault | undefined>({
    queryKey: ["vault", chainId, address],
    queryFn: async () =>
      unwrapServiceResult(
        "eVaultService.fetchVault",
        await sdk!.eVaultService.fetchVault(chainId, address as Address, {
          populateAll: true,
        })
      ),
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.vault,
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
    },
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.vaultWithDiagnostics,
  });
}

export function useEulerEarnDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<EulerEarn | undefined>({
    queryKey: ["eulerEarn", chainId, address],
    queryFn: async () =>
      unwrapServiceResult(
        "eulerEarnService.fetchVault",
        await sdk!.eulerEarnService.fetchVault(chainId, address as Address, {
          populateAll: true,
        })
      ),
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.eulerEarn,
  });
}

export function useSecuritizeVaultDetail(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<SecuritizeVault | undefined>({
    queryKey: ["securitize", chainId, address],
    queryFn: async () =>
      unwrapServiceResult(
        "securitizeVaultService.fetchVault",
        await sdk!.securitizeVaultService.fetchVault(chainId, address as Address, {
          populateMarketPrices: true,
          populateRewards: true,
          populateIntrinsicApy: true,
          populateLabels: true,
        })
      ),
    enabled: enabled && !!address,
    staleTime: STALE_TIMES.vault,
  });
}

export function useAccount(chainId: number, address: string | undefined) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<Account<VaultEntity>>({
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
    staleTime: STALE_TIMES.account,
  });
}

export function useAccountWithDiagnostics(
  chainId: number,
  address: string | undefined
) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<{
    account: Account<VaultEntity>;
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
    staleTime: STALE_TIMES.accountWithDiagnostics,
  });
}

export type AccountByChainResult = {
  chainId: number;
  chainName: string;
  account?: Account<VaultEntity>;
  diagnostics: DiagnosticIssue[];
  failedVaults: FailedVaultFetch[];
  error?: string;
};

export function useAccountAllChainsWithDiagnostics(
  address: string | undefined
) {
  const { sdk, enabled } = useSdkReady();
  const enabledChainIds = useEnabledChainIds();
  return useQuery<AccountByChainResult[]>({
    queryKey: [
      "accountWithDiagnostics",
      "allChains",
      address,
      enabledChainIds,
    ],
    queryFn: async () =>
      Promise.all(
        enabledChainIds.map(async (chainId) => {
          const chainName = CHAIN_NAMES[chainId] ?? String(chainId);
          try {
            const fetched = unwrapServiceResultWithDiagnostics(
              "accountService.fetchAccount",
              await sdk!.accountService.fetchAccount(
                chainId,
                address as Address,
                {
                  populateAll: true,
                  vaultFetchOptions: { populateAll: true },
                }
              )
            );
            const diagnostics = addChainMetadataToDiagnostics(
              fetched.diagnostics,
              chainId
            );
            return {
              chainId,
              chainName,
              account: fetched.result,
              diagnostics,
              failedVaults: addChainMetadataToFailedVaults(
                buildFailedVaultFetches(diagnostics),
                chainId
              ),
            } satisfies AccountByChainResult;
          } catch (error) {
            return {
              chainId,
              chainName,
              diagnostics: [],
              failedVaults: [],
              error: error instanceof Error ? error.message : String(error),
            } satisfies AccountByChainResult;
          }
        })
      ),
    enabled: enabled && !!address && address.length === 42,
    staleTime: STALE_TIMES.accountWithDiagnostics,
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
    staleTime: STALE_TIMES.walletBalance,
  });
}

export function useChainRewards() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery({
    queryKey: ["chainRewards", chainId],
    queryFn: async () => {
      const map = await sdk!.rewardsService.fetchChainRewards(chainId);
      // Convert Map to a serialisable array for display
      const entries: { vaultAddress: string; info: VaultRewardInfo }[] = [];
      for (const [vaultAddress, info] of map) {
        entries.push({ vaultAddress, info });
      }
      entries.sort((a, b) => b.info.totalRewardsApr - a.info.totalRewardsApr);
      return entries;
    },
    enabled,
    staleTime: STALE_TIMES.chainRewards,
  });
}

export function useOracleAdapterMetadataMap(chainId: number) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<OracleAdapterMetadataMap>({
    queryKey: ["oracleAdapterMetadataMap", chainId],
    queryFn: async () => sdk!.oracleAdapterService.fetchOracleAdapterMap(chainId),
    enabled: enabled && Number.isFinite(chainId),
    staleTime: STALE_TIMES.oracleAdapterMetadataMap,
  });
}

export function useTokenSymbolMap(chainId: number) {
  const { sdk, enabled } = useSdkReady();
  return useQuery<Record<string, string>>({
    queryKey: ["tokenSymbolMap", chainId],
    queryFn: async () => {
      const tokens = await sdk!.tokenlistService.loadTokenlist(chainId);
      return Object.fromEntries(
        tokens.map((token) => [token.address.toLowerCase(), token.symbol || token.name || token.address])
      );
    },
    enabled: enabled && Number.isFinite(chainId),
    staleTime: STALE_TIMES.tokenSymbolMap,
  });
}

export function useFeeFlowPageData() {
  const { sdk, chainId, enabled } = useSdkReady();
  return useQuery<{
    state: FeeFlowState;
    paymentTokenMeta?: { symbol?: string; decimals?: number; name?: string };
    candidates: FeeFlowCandidate[];
  }>({
    queryKey: ["feeFlowPageData", chainId],
    queryFn: async () => {
      const state = await sdk!.feeFlowService.fetchState(chainId);
      const fetched = unwrapServiceResult(
        "vaultMetaService.fetchVaults",
        await sdk!.vaultMetaService.fetchVaults(
          chainId,
          await fetchVaultAddressesFromLabelProducts(sdk!, chainId),
          {
            populateMarketPrices: true,
            populateRewards: true,
            populateIntrinsicApy: true,
            populateLabels: true,
          }
        )
      );

      const eVaults = fetched
        .filter((vault): vault is VaultEntity => vault !== undefined)
        .filter((vault): vault is EVault => isEVault(vault))
        .filter((vault) => !vault.eulerLabel?.deprecated);
      const eligibleVaults = sdk!.feeFlowService.getEligibleVaults(eVaults, chainId);
      const feeFlowSubAccount = unwrapServiceResult(
        "accountService.fetchSubAccount",
        await sdk!.accountService.fetchSubAccount(
          chainId,
          state.feeFlowControllerAddress,
          eligibleVaults.map((vault) => vault.address),
          { populateVaults: false }
        )
      );

      const feeFlowAssetsByVault = new Map<string, bigint>();
      for (const position of feeFlowSubAccount?.positions ?? []) {
        const key = position.vaultAddress.toLowerCase();
        feeFlowAssetsByVault.set(key, (feeFlowAssetsByVault.get(key) ?? 0n) + position.assets);
      }

      const candidates = eligibleVaults
        .map<FeeFlowCandidate>((vault) => {
          const protocolFeeBps = BigInt(Math.round(vault.fees.protocolFeeShare * 10_000));
          const protocolFeesAssets = (vault.fees.accumulatedFeesAssets * protocolFeeBps) / 10_000n;
          const feeFlowAssets = feeFlowAssetsByVault.get(vault.address.toLowerCase()) ?? 0n;
          const claimableAssets = protocolFeesAssets + feeFlowAssets;
          const claimableValueUsd =
            vault.marketPriceUsd === undefined
              ? 0n
              : (claimableAssets * vault.marketPriceUsd) / 10n ** BigInt(vault.asset.decimals);

          return {
            vault,
            protocolFeesAssets,
            feeFlowAssets,
            claimableAssets,
            claimableValueUsd,
          };
        })
        .filter((candidate) => candidate.claimableAssets > 0n)
        .sort((a, b) =>
          a.claimableValueUsd === b.claimableValueUsd
            ? a.claimableAssets === b.claimableAssets
              ? 0
              : a.claimableAssets > b.claimableAssets
                ? -1
                : 1
            : a.claimableValueUsd > b.claimableValueUsd
              ? -1
              : 1
        );

      const tokenList = await sdk!.tokenlistService.loadTokenlist(chainId);
      const paymentTokenMeta = tokenList.find(
        (token) => token.address.toLowerCase() === state.paymentToken.toLowerCase()
      );

      return {
        state,
        paymentTokenMeta,
        candidates,
      };
    },
    enabled,
    staleTime: STALE_TIMES.feeFlowPageData,
  });
}
