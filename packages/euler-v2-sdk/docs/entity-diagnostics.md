# Entity Diagnostics

## Purpose

Entity diagnostics provide optional metadata about normalization and fallback behavior without polluting entity shapes.

Examples:

- backend price unavailable, on-chain fallback used
- bigint value out of JS safe number range and clamped
- source field missing and default value applied

Diagnostics are stored in a sidecar `WeakMap<object, DataIssue[]>`, keyed by entity instance.

## API

Import from SDK root:

```ts
import {
  addEntityDataIssue,
  getEntityDataIssues,
  getEntityDataIssuesAtPath,
  hasEntityDataIssues,
  transferEntityDataIssues,
  type DataIssue,
  type DataIssueCode,
  type DataIssueSeverity,
} from "euler-v2-sdk";
```

Main functions:

- `addEntityDataIssue(entity, issue)` adds an issue to an entity sidecar.
- `getEntityDataIssues(entity)` returns all issues for that entity.
- `getEntityDataIssuesAtPath(entity, path)` filters by field path.
- `hasEntityDataIssues(entity)` quick boolean check.
- `transferEntityDataIssues(source, target)` moves/merges diagnostics across wrappers.

## Path Convention

Use JSONPath-like strings relative to the entity root:

- `$.marketPriceUsd`
- `$.liquidity.daysToLiquidation`
- `$.collaterals[2].liquidationLTV`

Stable, consistent path naming is important for UI consumers.

## Reading Diagnostics in App/UI

```ts
const issues = getEntityDataIssues(vault);

const marketPriceIssues = getEntityDataIssuesAtPath(vault, "$.marketPriceUsd");
const usedFallback = marketPriceIssues.some((i) => i.code === "FALLBACK_USED");
```

Typical UI pattern:

- show badge/icon when `hasEntityDataIssues(entity)` is true
- show per-field hints/tooltips via `getEntityDataIssuesAtPath(...)`

## Throw Policy

Converters and services normalize and collect diagnostics by default.

Decision to throw on conversion issues is up to the consumer:

- read issues with `getEntityDataIssues(...)`
- define your own blocking policy (by `severity`, `code`, `path`)
- throw in your app boundary when policy conditions are met

## Wiring for Custom Entities

### 1) In custom converter/normalizer

```ts
import {
  addEntityDataIssue,
  transferEntityDataIssues,
} from "euler-v2-sdk";

export function convertCustomVault(raw: RawVault): CustomVaultData {
  let decimals: number;
  if (raw.decimals > BigInt(Number.MAX_SAFE_INTEGER)) {
    decimals = Number.MAX_SAFE_INTEGER;
    addEntityDataIssue(raw as object, {
      code: "OUT_OF_RANGE_CLAMPED",
      severity: "warning",
      message: "Decimals out of safe range and clamped.",
      path: "$.asset.decimals",
      source: "customSource",
      originalValue: raw.decimals.toString(),
      normalizedValue: decimals,
    });
  } else {
    decimals = Number(raw.decimals);
  }

  const result: CustomVaultData = {
    address: raw.vault,
    decimals,
  };

  transferEntityDataIssues(raw as object, result as object);
  return result;
}
```

### Consumer-side strict policy example

```ts
import { getEntityDataIssues } from "euler-v2-sdk";

const issues = getEntityDataIssues(vault);
const blocking = issues.find((i) => i.severity === "error");
if (blocking) throw new Error(blocking.message);
```

### 2) In custom entity class constructor

If your class wraps plain converted data, transfer diagnostics from input object:

```ts
import { transferEntityDataIssues } from "euler-v2-sdk";

class CustomVaultEntity {
  constructor(data: CustomVaultData) {
    transferEntityDataIssues(data as object, this);
    // assign fields...
  }
}
```

This keeps diagnostics available after wrapping.

### 3) In custom services with fallback logic

Record both source failure and fallback usage on the affected entity:

```ts
import { addEntityDataIssue } from "euler-v2-sdk";

async function populateCustomPrice(entity: CustomVaultEntity): Promise<void> {
  try {
    const backend = await queryBackend(entity);
    if (backend) {
      entity.marketPriceUsd = backend;
      return;
    }
    addEntityDataIssue(entity, {
      code: "SOURCE_UNAVAILABLE",
      severity: "warning",
      message: "Backend price unavailable.",
      path: "$.marketPriceUsd",
      source: "customBackend",
      normalizedValue: "fallback:onchain",
    });
  } catch (error) {
    addEntityDataIssue(entity, {
      code: "SOURCE_UNAVAILABLE",
      severity: "warning",
      message: "Backend price request failed.",
      path: "$.marketPriceUsd",
      source: "customBackend",
      originalValue: error instanceof Error ? error.message : String(error),
      normalizedValue: "fallback:onchain",
    });
  }

  addEntityDataIssue(entity, {
    code: "FALLBACK_USED",
    severity: "info",
    message: "On-chain fallback source used.",
    path: "$.marketPriceUsd",
    source: "customOracle",
  });

  entity.marketPriceUsd = await queryOnchain(entity);
}
```

## Recommended Issue Codes

Use shared codes for consistent downstream behavior:

- `SOURCE_UNAVAILABLE`
- `FALLBACK_USED`
- `OUT_OF_RANGE_CLAMPED`
- `DEFAULT_APPLIED`
- `PRECISION_LOSS`
- `DECODE_FAILED`

If you need app-specific codes, keep shared semantics in `message` and `source`.
