---
title: Fallback Adapter for V3 / Onchain Routing
impact: HIGH
impactDescription: Prevents over-eager fallbacks, lost fast-path latency, and silent data loss
tags: sdk, fallback, v3, onchain, reliability, telemetry, runtime
---

## Fallback Adapter for V3 / Onchain Routing

`buildEulerSDK` wraps `accountService`, `eVaultService`, `eulerEarnService`, `vaultMetaService`, and `rewardsService` in fallback adapters (V3 → onchain / subgraph / direct). Configure them explicitly and read telemetry through `onFallback` rather than guessing why a call fell back from `primaryIssues` alone.

**Incorrect (over-eager fallback inferred from any SOURCE_UNAVAILABLE):**

```typescript
// WRONG: Treats per-collateral oracle warnings as a fallback trigger.
const wrapped = createFallbackAdapter(primary, secondary, {
  methods: ["fetchVaults"],
  adapterNames: { primary: "v3", secondary: "onchain" },
  shouldFallback: (r) => r.errors.some((e) => e.code === "SOURCE_UNAVAILABLE"),
});
```

Per-entity warnings on a fully-populated response should not trigger fallback — the secondary cannot recover information the primary already returned, and re-fetching only doubles latency.

**Correct (rely on the default trigger logic):**

```typescript
const wrapped = createFallbackAdapter(primary, secondary, {
  methods: ["fetchVaults"],
  adapterNames: { primary: "v3", secondary: "onchain" },
});
// Default falls back ONLY when:
// - primary throws,
// - ServiceResult.result is undefined, or
// - result is an array containing at least one undefined slot.
```

**Correct (route by service-level config in buildEulerSDK):**

```typescript
const sdk = await buildEulerSDK({
  config: {
    v3ApiUrl: process.env.EULER_SDK_V3_API_URL,
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
    eVaultServiceAdapter: "fallback",     // default when both adapters are buildable
    accountServiceAdapter: "v3",          // pin to V3 only
    rewardsServiceAdapter: "direct",      // pin to direct (no V3 calls)
    disableV3: process.env.ENV === "ci",  // global kill switch for V3 across all chains
  },
});
```

`disableV3: true` collapses every `"fallback"` selection to its non-V3 alternative. If V3 credentials are simply missing, fallback chains auto-collapse to the secondary with a one-line warning during construction — never throw.

**Correct (observe fallback events via telemetry):**

```typescript
import { buildEulerSDK, type FallbackInfo } from "@eulerxyz/euler-v2-sdk";

const sdk = await buildEulerSDK({
  onFallback: (info: FallbackInfo) => {
    // info.trigger distinguishes the real cause:
    //   "primary-threw" | "result-undefined" | "array-missing-slots"
    //   | "custom-shouldFallback" | "circuit-open"
    // info.missingIndices is populated for "array-missing-slots".
    metrics.increment("sdk.fallback", {
      method: info.method,
      adapter: info.primaryName,
      trigger: info.trigger,
    });
  },
});
```

Use `info.trigger` for routing logic; treat `info.primaryIssues` as context only. Per-entity warnings appear in `primaryIssues` whenever the primary returned a `ServiceResult`, but they never by themselves cause the fallback — the actual cause is whatever `trigger` says.

**Correct (custom fallback for a non-built-in adapter):**

```typescript
import { createFallbackAdapter } from "@eulerxyz/euler-v2-sdk";

const wrapped = createFallbackAdapter<MyAdapter, "fetchThings">(primary, secondary, {
  methods: ["fetchThings"],
  adapterNames: { primary: "v3", secondary: "onchain" },
  // Trip the circuit after 3 consecutive primary failures, skip primary for 30s.
  circuitBreaker: { failures: 3, cooldownMs: 30_000 },
  onFallback: (info) => console.log("fallback", info.method, info.trigger),
});
```

Only methods listed in `methods` are wrapped; setters and other state (`setConfig`, `setPlugins`, internal caches) pass through to the primary unchanged. Methods that return a plain `Promise` (not a `ServiceResult`) fall back only on throw.

Diagnostics on the returned secondary `ServiceResult` are prefixed with a `FALLBACK_USED` issue (`severity: "info"`, `source: "<primary>"`, `originalValue` carries the primary error or its `errors[]`). UIs that surface diagnostics already pick this up; routing decisions should still come from `onFallback`'s `trigger`, not from scraping the `errors` array.

See [`packages/euler-v2-sdk/docs/fallback-system.md`](../../../packages/euler-v2-sdk/docs/fallback-system.md) for the full reference, [`packages/euler-v2-sdk/docs/entity-diagnostics.md`](../../../packages/euler-v2-sdk/docs/entity-diagnostics.md) for `DataIssue` shape, and `packages/euler-v2-sdk/test/fallbackAdapter.test.ts` for the trigger-by-trigger test matrix.
