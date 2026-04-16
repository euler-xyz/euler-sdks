---
title: UI Data Layer with Fetch Options and Population
impact: HIGH
impactDescription: Prevents undefined computed values and stale portfolio views
tags: react, queries, accountService, population, computed-properties
---

## UI Data Layer with Fetch Options and Population

Explicitly set population flags based on what the screen needs. Computed metrics require populated dependencies.

**Incorrect (expecting computed USD/risk metrics without population):**

```typescript
const { result: account } = await sdk.accountService.fetchAccount(chainId, owner, {
  populateVaults: false,
});

console.log(account.netAssetValueUsd); // undefined
```

**Correct (declare population requirements):**

```typescript
const { result: account, errors } = await sdk.accountService.fetchAccount(chainId, owner, {
  populateVaults: true,
  populateMarketPrices: true,
  populateUserRewards: true,
  vaultFetchOptions: {
    populateMarketPrices: true,
    populateCollaterals: true,
    populateStrategyVaults: true,
    populateRewards: true,
    populateIntrinsicApy: true,
    populateLabels: true,
  },
});
```

Use `populated` flags as a hard guard before rendering computed fields:

```typescript
if (!account.populated.marketPrices) return null;
if (!account.populated.vaults) return null;
```

Keep `errors` alongside the entity snapshot. Diagnostics are not entity state; use them for field-level badges, telemetry, and policy decisions.

For React UIs:

1. Build SDK in a provider/context once.
2. Use query hooks per feature (`vault list`, `vault detail`, `account`, `rewards`).
3. Use short UI stale times and let `buildQuery` handle deeper caching.
4. Re-fetch account/vault data after successful execution receipts.
5. For batch vault calls, handle sparse arrays (`undefined` entries) and map diagnostics by `entityId` to show per-address failures.

Reference: `packages/euler-v2-sdk/docs/basic-usage.md`, `docs/cross-service-data-population.md`, `docs/account-computed-properties.md`, `docs/entity-diagnostics.md`, `examples/react-sdk-example/src/queries/sdkQueries.ts`
