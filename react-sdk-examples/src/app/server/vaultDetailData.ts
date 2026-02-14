import type { Address } from "viem";
import { getServerQueryClient } from "./queryClient";
import { getServerSdk } from "./sdk";
import { getCachedVaultListSnapshot } from "./vaultsData";

const DETAIL_STALE_TIME_MS = 5 * 60_000;
const DETAIL_REFRESH_ERROR_RETRY_COOLDOWN_MS = 30_000;

type ServerSdk = Awaited<ReturnType<typeof getServerSdk>>;
type VaultDetail = Awaited<
  ReturnType<ServerSdk["eVaultService"]["fetchVault"]>
>;

interface RefreshError {
  message: string;
  at: number;
}

export interface VaultDetailListSnapshot {
  updatedAt: number | null;
  address: string;
  name: string;
  assetSymbol: string;
  totalSupply: string;
  totalBorrows: string;
  supplyApy: string;
  borrowApy: string;
  marketPriceUsd: string;
  collateralCount: number;
}

export interface VaultDetailData {
  vault: VaultDetail | null;
  listSnapshot: VaultDetailListSnapshot | null;
  detailUpdatedAt: number | null;
  detailIsStale: boolean;
  isRefreshing: boolean;
  refreshError: string | null;
  refreshErrorAt: number | null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function getVaultDetailQueryKey(chainId: number, address: Address) {
  return ["sdk", "vaultDetail", chainId, address.toLowerCase()] as const;
}

function getRefreshError(
  state:
    | {
        error: unknown;
        errorUpdatedAt: number;
      }
    | undefined,
): RefreshError | null {
  if (!state?.error) return null;
  return {
    message: toErrorMessage(state.error),
    at: state.errorUpdatedAt || Date.now(),
  };
}

function shouldRetryBackgroundRefresh(
  errorUpdatedAt: number | undefined,
): boolean {
  if (!errorUpdatedAt) return true;
  return Date.now() - errorUpdatedAt >= DETAIL_REFRESH_ERROR_RETRY_COOLDOWN_MS;
}

async function fetchFreshVaultDetail(
  chainId: number,
  address: Address,
): Promise<VaultDetail> {
  const sdk = await getServerSdk();
  return sdk.eVaultService.fetchVault(chainId, address, {
    populateCollaterals: true,
    populateMarketPrices: true,
  });
}

export async function getVaultDetailData(
  chainId: number,
  address: Address,
): Promise<VaultDetailData> {
  const queryClient = getServerQueryClient();
  const queryKey = getVaultDetailQueryKey(chainId, address);

  const detailStateBefore = queryClient.getQueryState<VaultDetail>(queryKey);
  const previousDetail = detailStateBefore?.data;

  const listSnapshotSource = getCachedVaultListSnapshot(chainId, address);
  const listSnapshot = listSnapshotSource.row
    ? {
        updatedAt: listSnapshotSource.snapshotUpdatedAt,
        ...listSnapshotSource.row,
      }
    : null;

  let detail: VaultDetail | null = null;
  let refreshStarted = false;

  if (previousDetail) {
    try {
      detail = await queryClient.ensureQueryData({
        queryKey,
        staleTime: DETAIL_STALE_TIME_MS,
        revalidateIfStale: true,
        queryFn: () => fetchFreshVaultDetail(chainId, address),
      });
    } catch {
      detail = previousDetail;
    }
  } else if (listSnapshot) {
    const state = queryClient.getQueryState<VaultDetail>(queryKey);
    if (
      state?.fetchStatus !== "fetching" &&
      shouldRetryBackgroundRefresh(state?.errorUpdatedAt)
    ) {
      refreshStarted = true;
      void queryClient.prefetchQuery({
        queryKey,
        staleTime: DETAIL_STALE_TIME_MS,
        queryFn: () => fetchFreshVaultDetail(chainId, address),
      });
    }
  } else {
    detail = await queryClient.fetchQuery({
      queryKey,
      staleTime: DETAIL_STALE_TIME_MS,
      queryFn: () => fetchFreshVaultDetail(chainId, address),
    });
  }

  const detailState = queryClient.getQueryState<VaultDetail>(queryKey);
  const detailUpdatedAt = detailState?.dataUpdatedAt || null;
  const refreshError = getRefreshError(detailState);

  return {
    vault: detail,
    listSnapshot,
    detailUpdatedAt,
    detailIsStale:
      !detailUpdatedAt || Date.now() - detailUpdatedAt >= DETAIL_STALE_TIME_MS,
    isRefreshing: refreshStarted || detailState?.fetchStatus === "fetching",
    refreshError: refreshError?.message ?? null,
    refreshErrorAt: refreshError?.at ?? null,
  };
}
