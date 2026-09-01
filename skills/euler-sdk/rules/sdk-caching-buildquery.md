---
title: Query Decoration and Caching with buildQuery
impact: HIGH
impactDescription: Reduces RPC/API load and stabilizes UI latency
tags: caching, buildQuery, react-query, performance
---

## Query Decoration and Caching with buildQuery

Wrap SDK `query*` methods through `buildQuery` instead of adding ad-hoc caches around service calls.
When adding a new RPC/API dependency, expose it as a `query*` method on the adapter or service rather than calling it directly from orchestration code.

**Correct pattern:**

```typescript
import { QueryClient } from "@tanstack/react-query";
import { serializeQueryArgs, type BuildQueryFn } from "euler-v2-sdk";

const queryClient = new QueryClient();

const buildQuery: BuildQueryFn = (queryName, fn, _target, context) => {
  const staleTime = queryName.startsWith("querySwap") ? 10_000 : 60_000;
  return ((...args: unknown[]) => {
    const cacheKey = context
      ? context.getCacheKey(args)
      : serializeQueryArgs(args);
    if (cacheKey === null) return fn(...args);

    return queryClient.fetchQuery({
      queryKey: ["sdk", queryName, cacheKey],
      queryFn: () => fn(...args),
      staleTime,
    });
  }) as typeof fn;
};
```

Treat `context.getCacheKey(args) === null` as an explicit no-cache signal and
call the underlying fetcher directly. Do not replace it with a generic key;
cursor-based pagination uses this contract to avoid retaining every page.

Recommended stale-time strategy:

- hours (e.g. 12-24h): deployments, ABI, token list, static labels
- minutes: perspectives, providers, reward campaign catalogs
- minutes: external intrinsic APY queries such as `queryV3IntrinsicApy`
- minutes: oracle assessment queries such as `queryV3OracleAdapterAssessment` and `queryV3OracleAdapterAssessmentsPage`
- 10-30s: vault/account/wallet state
- ~5s: transaction-sensitive wallet reads such as `queryNativeBalance`, `queryTokenBalances`, `queryAllowance`, and `queryPermit2Allowance`
- ~10s: swap quotes and Pyth update payloads

This keeps service-level `fetch*` orchestration cheap because underlying `query*` calls are cached.
By default, `buildEulerSDK` applies a 5s in-memory cache to decorated `query*` methods. Supplying a custom `buildQuery` replaces that default cache layer, so include caching/deduping there if the app needs it.

Reference: `packages/euler-v2-sdk/docs/caching-external-data-queries.md`, `examples/react-sdk-example/src/queries/sdkQueries.ts`
