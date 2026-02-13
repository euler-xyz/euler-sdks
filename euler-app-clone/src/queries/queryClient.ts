import { QueryClient } from "@tanstack/react-query";
import type { BuildQueryFn } from "euler-v2-sdk";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

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

const STALE_TIMES: Record<string, number> = {
  queryVerifiedArray: 5 * 60_000,
  queryVaultFactories: 5 * 60_000,
  queryDeployments: Infinity,
};

const DEFAULT_STALE_TIME = 60_000;

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
