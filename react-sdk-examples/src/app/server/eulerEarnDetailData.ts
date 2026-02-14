import type { Address } from "viem";
import { getServerQueryClient } from "./queryClient";
import { getServerSdk } from "./sdk";
import { getCachedEulerEarnListSnapshot } from "./vaultsData";

const DETAIL_STALE_TIME_MS = 5 * 60_000;
const DETAIL_REFRESH_ERROR_RETRY_COOLDOWN_MS = 30_000;

type ServerSdk = Awaited<ReturnType<typeof getServerSdk>>;
type EulerEarnDetail = Awaited<
  ReturnType<ServerSdk["eulerEarnService"]["fetchVault"]>
>;

interface RefreshError {
  message: string;
  at: number;
}

export interface EulerEarnDetailListSnapshot {
  updatedAt: number | null;
  address: string;
  name: string;
  assetSymbol: string;
  totalAssets: string;
  marketPriceUsd: string;
  strategyCount: number;
  performanceFee: string;
}

export interface EulerEarnDetailData {
  vault: EulerEarnDetail | null;
  listSnapshot: EulerEarnDetailListSnapshot | null;
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

function getEulerEarnDetailQueryKey(chainId: number, address: Address) {
  return ["sdk", "eulerEarnDetail", chainId, address.toLowerCase()] as const;
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

async function fetchFreshEulerEarnDetail(
  chainId: number,
  address: Address,
): Promise<EulerEarnDetail> {
  const sdk = await getServerSdk();
  return sdk.eulerEarnService.fetchVault(chainId, address, {
    populateMarketPrices: true,
  });
}

export async function getEulerEarnDetailData(
  chainId: number,
  address: Address,
): Promise<EulerEarnDetailData> {
  const queryClient = getServerQueryClient();
  const queryKey = getEulerEarnDetailQueryKey(chainId, address);

  const detailStateBefore =
    queryClient.getQueryState<EulerEarnDetail>(queryKey);
  const previousDetail = detailStateBefore?.data;

  const listSnapshotSource = getCachedEulerEarnListSnapshot(chainId, address);
  const listSnapshot = listSnapshotSource.row
    ? {
        updatedAt: listSnapshotSource.snapshotUpdatedAt,
        ...listSnapshotSource.row,
      }
    : null;

  let detail: EulerEarnDetail | null = null;
  let refreshStarted = false;

  if (previousDetail) {
    const state = queryClient.getQueryState<EulerEarnDetail>(queryKey);
    const shouldAttemptRefresh =
      state?.fetchStatus === "fetching" ||
      shouldRetryBackgroundRefresh(state?.errorUpdatedAt);

    if (!shouldAttemptRefresh) {
      detail = previousDetail;
    } else {
      try {
        detail = await queryClient.ensureQueryData({
          queryKey,
          staleTime: DETAIL_STALE_TIME_MS,
          revalidateIfStale: true,
          queryFn: () => fetchFreshEulerEarnDetail(chainId, address),
        });
      } catch {
        detail = previousDetail;
      }
    }
  } else if (listSnapshot) {
    const state = queryClient.getQueryState<EulerEarnDetail>(queryKey);
    if (
      state?.fetchStatus !== "fetching" &&
      shouldRetryBackgroundRefresh(state?.errorUpdatedAt)
    ) {
      refreshStarted = true;
      void queryClient.prefetchQuery({
        queryKey,
        staleTime: DETAIL_STALE_TIME_MS,
        queryFn: () => fetchFreshEulerEarnDetail(chainId, address),
      });
    }
  } else {
    detail = await queryClient.fetchQuery({
      queryKey,
      staleTime: DETAIL_STALE_TIME_MS,
      queryFn: () => fetchFreshEulerEarnDetail(chainId, address),
    });
  }

  const detailState = queryClient.getQueryState<EulerEarnDetail>(queryKey);
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
