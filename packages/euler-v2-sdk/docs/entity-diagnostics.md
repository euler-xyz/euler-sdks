# Entity Diagnostics

## What Diagnostics Are

A diagnostic is a structured note about data quality or fallback handling for one field in a fetched entity.

Each diagnostic is a `DataIssue`:

- `code`: category (`COERCED_TYPE`, `OUT_OF_RANGE_CLAMPED`, `SOURCE_UNAVAILABLE`, `FALLBACK_USED`, ...)
- `severity`: `info | warning | error`
- `message`: short human-readable explanation
- `path`: JSONPath-like location from the fetch result root
- `entityId`: stable entity identifier when known (address for account/subaccount/vault/wallet/asset)
- optional `source`, `originalValue`, `normalizedValue`

Diagnostics are not entity state. They describe how the returned snapshot was built.

## Why Diagnostics Are Useful

They let consumers handle imperfect upstream data without guessing:

- UI: show badges like “fallback price used” or “value clamped” on exact fields
- Observability: count recurring source failures by `code`/`source`
- Policy: decide in app code when to warn, ignore, retry, or throw
- Safety: keep entity models clean while still exposing normalization/fallback behavior

Because diagnostics paths target the fetched snapshot, they are most reliable right after fetch.  
If callers mutate/reorder entities later, paths may no longer match.

## Service Return Pattern

Fetch/build services return diagnostics next to data:

- `fetchAccount(...) -> { result, errors }`
- `fetchSubAccount(...) -> { result, errors }`
- `fetchWallet(...) -> { result, errors }`
- `fetchVault(...) -> { result, errors }`
- `fetchVaults(...) -> { result, errors }`
- `fetchVerifiedVaults(...) -> { result, errors }`
- `fetchAllVaults(...) -> { result, errors }`

For batch vault fetches (`fetchVaults`, `fetchVerifiedVaults`, `fetchAllVaults`), `result` may contain `undefined` entries for per-vault failures. Those failures are reported in `errors` with `entityId` set to the affected vault address. For `fetchVaults` and `fetchVerifiedVaults`, result order matches the input/discovery order. For `fetchAllVaults`, entries rejected by the optional pre-population filter are also returned as `undefined`.

Fetch option objects also support `populateAll: true` to force all enrichment steps on.

Errors include issues from nested entities and populated sub-services, path-prefixed from the top-level result.

## Entity Populate Pattern

Entity `populateX` methods mutate the entity and return diagnostics directly:

- `populateVaults(...) -> DataIssue[]`
- `populateCollaterals(...) -> DataIssue[]`
- `populateStrategyVaults(...) -> DataIssue[]`
- `populateMarketPrices(...) -> DataIssue[]`
- `populateRewards(...) -> DataIssue[]`
- `populateUserRewards(...) -> DataIssue[]`

In addition to diagnostics, entities maintain enrichment state in `entity.populated` flags.
Use diagnostics (`DataIssue[]`) for quality/fallback/source details, and `populated` for whether a populate step has been executed.

PriceService also exposes diagnostics-aware methods for direct callers:

- `fetchAssetUsdPriceWithDiagnostics(...) -> { result, errors }`
- `fetchCollateralUsdPriceWithDiagnostics(...) -> { result, errors }`
- `fetchUnitOfAccountUsdRateWithDiagnostics(...) -> { result, errors }`

These methods emit `FALLBACK_USED` when backend pricing is unavailable and on-chain pricing is used instead.

## API

```ts
import type { DataIssue, ServiceResult } from "euler-v2-sdk";
```

- `DataIssue`: one normalization/fallback/source issue with JSONPath-like `path`.
- `ServiceResult<T>`: `{ result: T, errors: DataIssue[] }`.

## Paths

Paths are relative to top-level fetch result:

- `$.subAccounts[0].positions[1].liquidity.daysToLiquidation`
- `$.marketPriceUsd`
- `$.userRewards`

## Consumer Policy

The SDK always collects diagnostics during fetch/build.
Throw policy is consumer-defined.

```ts
const { result: account, errors } = await sdk.accountService.fetchAccount(chainId, owner);
const blocking = errors.find((e) => e.severity === "error");
if (blocking) throw new Error(blocking.message);
```

UI usage example:

```ts
const priceIssues = errors.filter((e) => e.path.includes("marketPriceUsd"));
const hasFallback = priceIssues.some((e) => e.code === "FALLBACK_USED");
```

Batch vault usage example:

```ts
const { result: vaults, errors } = await sdk.vaultMetaService.fetchVaults(chainId, addresses);

vaults.forEach((vault, i) => {
  const address = addresses[i].toLowerCase();
  if (!vault) {
    // hard failure for this address
    return;
  }
  const rowIssues = errors.filter((e) => e.entityId?.toLowerCase() === address);
  // render vault row + warning/error indicators
});
```

## Custom Converter Pattern

Use normalization helpers and append issues to a local `errors` array.

```ts
import { bigintToSafeNumber, type DataIssue } from "euler-v2-sdk";

function convertCustom(raw: { decimals: bigint }, errors: DataIssue[]) {
  const decimals = bigintToSafeNumber(raw.decimals, {
    path: "$.decimals",
    errors,
    source: "customSource",
  });
  return { decimals };
}
```

## Custom Service Pattern

Build diagnostics in parallel with result data and return together:

```ts
import type { DataIssue, ServiceResult } from "euler-v2-sdk";

async function fetchCustom(): Promise<ServiceResult<{ price?: number }>> {
  const errors: DataIssue[] = [];
  const result: { price?: number } = {};

  try {
    result.price = await fetchPrimary();
  } catch (error) {
    errors.push({
      code: "SOURCE_UNAVAILABLE",
      severity: "warning",
      message: "Primary source failed; fallback used.",
      path: "$.price",
      source: "primaryApi",
      originalValue: error instanceof Error ? error.message : String(error),
    });
    result.price = await fetchFallback();
  }

  return { result, errors };
}
```
