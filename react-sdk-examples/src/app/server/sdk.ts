import { type BuildQueryFn, buildSDK, type EulerSDK } from "euler-v2-sdk";
import { RPC_URLS } from "../config/chains";
import { getServerQueryClient } from "./queryClient";

let sdkPromise: Promise<EulerSDK> | null = null;
const ENABLE_SERVER_SDK_LOGS = process.env.NODE_ENV === "development";
const MINUTE = 60_000;
const FIVE_MINUTES = 5 * MINUTE;

const STALE_TIMES: Record<string, number> = {
  queryDeployments: Infinity,
  queryABI: Infinity,
  queryTokenList: Infinity,
  queryEulerLabelsVaults: Infinity,
  queryEulerLabelsEntities: Infinity,
  queryEulerLabelsProducts: Infinity,

  queryVerifiedArray: FIVE_MINUTES,
  queryEulerEarnVerifiedArray: FIVE_MINUTES,
  queryVaultFactories: FIVE_MINUTES,

  queryVaultInfoFull: FIVE_MINUTES,
  queryEulerEarnVaultInfoFull: FIVE_MINUTES,
  queryVaultInfoERC4626: FIVE_MINUTES,

  queryGovernorAdmin: 60 * MINUTE,
  querySupplyCapResolved: 60 * MINUTE,

  queryAssetPriceInfo: FIVE_MINUTES,
  queryPricesBatch: FIVE_MINUTES,

  querySwapQuotes: 10_000,
  queryAccountVaults: 30_000,

  queryEVCAccountInfo: 15_000,
  queryVaultAccountInfo: 15_000,
  queryBalanceOf: 15_000,
  queryAllowance: 15_000,
  queryPermit2Allowance: 15_000,
};

const DEFAULT_STALE_TIME = MINUTE;

function serializeArg(arg: unknown): unknown {
  if (typeof arg === "bigint") return `bigint:${arg.toString()}`;

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

const serverBuildQuery: BuildQueryFn = (queryName, fn) => {
  const staleTime = STALE_TIMES[queryName] ?? DEFAULT_STALE_TIME;

  const wrapped = (...args: unknown[]) => {
    const queryClient = getServerQueryClient();
    const queryKey = ["sdk", queryName, ...args.map(serializeArg)];
    const stateBefore = queryClient.getQueryState(queryKey);
    const isFresh =
      !!stateBefore?.dataUpdatedAt &&
      (staleTime === Infinity ||
        Date.now() - stateBefore.dataUpdatedAt < staleTime);

    if (ENABLE_SERVER_SDK_LOGS) {
      console.log(
        `[rq:sdk:server] request ${queryName} (${isFresh ? "cache-hit" : "cache-miss"})`,
        queryKey,
      );
    }

    return queryClient.fetchQuery({
      queryKey,
      staleTime,
      queryFn: async () => {
        const startedAt = Date.now();
        if (ENABLE_SERVER_SDK_LOGS) {
          console.log(`[rq:sdk:server] execute ${queryName}`, queryKey);
        }

        try {
          const result = await fn(...args);
          if (ENABLE_SERVER_SDK_LOGS) {
            console.log(
              `[rq:sdk:server] done ${queryName} (${Date.now() - startedAt}ms)`,
            );
          }
          return result;
        } catch (error) {
          if (ENABLE_SERVER_SDK_LOGS) {
            console.error(
              `[rq:sdk:server] error ${queryName} (${Date.now() - startedAt}ms)`,
              error,
            );
          }
          throw error;
        }
      },
    });
  };

  return wrapped as typeof fn;
};

export function getServerSdk(): Promise<EulerSDK> {
  if (!sdkPromise) {
    sdkPromise = buildSDK({ rpcUrls: RPC_URLS, buildQuery: serverBuildQuery });
  }

  return sdkPromise;
}
