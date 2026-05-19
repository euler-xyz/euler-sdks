# Fallback System

The SDK ships with a generic fallback adapter that pairs a primary data source with a secondary one. When the primary fails to produce data, the secondary is called transparently and the result is returned to the caller with a `FALLBACK_USED` diagnostic attached.

## Why It Exists

SDK services are built from interchangeable adapters: V3 (HTTP API) is fast but optional; on-chain / subgraph adapters are slower but always available. The fallback adapter lets services be configured to prefer V3 and recover automatically when V3 is unavailable, partially incomplete, or not deployed for a chain.

This is the mechanism behind:

- `accountService` (V3 → onchain)
- `eVaultService` / `eulerEarnService` (V3 → onchain)
- `vaultMetaService` type resolver (V3 → subgraph)
- `rewardsService` (V3 → direct)

## Service Behavior

By default, `buildEulerSDK` wires each of those services as a fallback chain when both adapters are buildable. Each per-service config field accepts the literal `"fallback"` to force this behavior, or `"v3"` / `"onchain"` / `"direct"` / `"subgraph"` to pin a single adapter.

```ts
const sdk = await buildEulerSDK({
  config: {
    v3ApiUrl: process.env.EULER_SDK_V3_API_URL,
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
    eVaultServiceAdapter: "fallback",     // explicit (also the default)
    accountServiceAdapter: "v3",          // pin to V3 only
    rewardsServiceAdapter: "direct",      // pin to direct only
    disableV3: false,                     // set true to disable V3 globally
  },
});
```

`disableV3: true` short-circuits every `"fallback"` selection to the non-V3 adapter, and is the safest setting when the V3 endpoint is intentionally unreachable.

If V3 credentials are not configured, the fallback chain collapses gracefully to the secondary adapter (a one-line warning is logged once during construction).

## Fallback Triggers

The wrapper considers a primary call failed in these cases:

| Trigger                  | When                                                              |
|--------------------------|-------------------------------------------------------------------|
| `primary-threw`          | The primary function threw or rejected.                           |
| `result-undefined`       | `ServiceResult.result === undefined`.                             |
| `array-missing-slots`    | `result` is an array with at least one `undefined` entry.         |
| `custom-shouldFallback`  | A caller-supplied `shouldFallback(primary)` returned `true`.      |
| `circuit-open`           | The circuit breaker is open and the primary call is being skipped.|

Per-item warnings (e.g. `SOURCE_UNAVAILABLE` on a nested oracle) on a **fully-populated** response do **not** trigger fallback — the secondary cannot recover information the primary already returned, and re-fetching only doubles latency.

## Telemetry

Pass an `onFallback` callback to `buildEulerSDK` to observe every fallback event:

```ts
import { buildEulerSDK, type FallbackInfo } from "@eulerxyz/euler-v2-sdk";

const sdk = await buildEulerSDK({
  onFallback: (info: FallbackInfo) => {
    metrics.increment("sdk.fallback", {
      method: info.method,
      primary: info.primaryName,
      trigger: info.trigger,
    });
  },
});
```

`FallbackInfo` fields:

- `method`: wrapped method name (e.g. `"fetchVaults"`)
- `args`: forwarded arguments
- `primaryName` / `secondaryName`: adapter names
- `trigger`: discriminator — `"primary-threw" | "result-undefined" | "array-missing-slots" | "custom-shouldFallback" | "circuit-open"`
- `primaryError`: thrown error (when `trigger === "primary-threw"`)
- `primaryIssues`: `DataIssue[]` from the primary's `ServiceResult` when it returned one
- `missingIndices`: array indices that were `undefined` (when `trigger === "array-missing-slots"`)

Use `trigger` for routing, not `primaryIssues.length`: per-entity warnings on a populated response are reported in `primaryIssues` for context but never cause the fallback — those would be `"primary-threw"`, `"result-undefined"`, or `"array-missing-slots"` instead.

## Diagnostics on the Returned Result

When the secondary returns a `ServiceResult`, the wrapper prepends a `FALLBACK_USED` diagnostic to its `errors` array:

```ts
{
  code: "FALLBACK_USED",
  severity: "info",
  message: "Fell back from <primary> to <secondary> for <method>.",
  source: "<primary adapter name>",
  originalValue: <primary error message OR primary errors[]>,
  locations: [{ owner: { kind: "service", service: "<primary>", method: "<method>" } }],
}
```

This makes fallback events visible to consumers who only inspect `errors`, in addition to the `onFallback` stream.

## Building a Custom Fallback Adapter

Compose your own fallback chain with `createFallbackAdapter`:

```ts
import { createFallbackAdapter } from "@eulerxyz/euler-v2-sdk";

const wrapped = createFallbackAdapter<MyAdapter, "fetchThings">(primary, secondary, {
  methods: ["fetchThings"],
  adapterNames: { primary: "v3", secondary: "onchain" },
  onFallback: (info) => console.log("fallback", info),

  // Optional: skip primary for cooldownMs after `failures` consecutive failures.
  circuitBreaker: { failures: 3, cooldownMs: 30_000 },

  // Optional: override the default trigger logic. Receives the primary ServiceResult.
  shouldFallback: (primary) => primary.errors.some((e) => e.code === "SOURCE_UNAVAILABLE"),
});
```

Notes:

- Only methods named in `methods` are wrapped. Setters and other state (`setConfig`, `setPlugins`, internal caches) pass through to the primary unchanged.
- Methods that do not return a `ServiceResult` (plain Promise) fall back only on throw.
- `onFallback` exceptions are swallowed so telemetry can never break the data flow.
- If `shouldFallback` is provided, it fully replaces the default trigger logic — `trigger` becomes `"custom-shouldFallback"` whenever it returns `true`.
