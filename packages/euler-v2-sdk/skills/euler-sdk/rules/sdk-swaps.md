---
title: Swap Quotes and Swap-Driven Execution Flows
impact: HIGH
impactDescription: Avoids incorrect quote usage and repay/swap mismatches
tags: swaps, quote, repay, collateral, multiply
---

## Swap Quotes and Swap-Driven Execution Flows

Use `swapService` as the first step for any swap-driven action, then feed selected quotes into `executionService.plan*`.

**Correct flow:**

```typescript
const quotes = await sdk.swapService.fetchRepayQuotes({
  chainId,
  fromVault,
  fromAsset,
  fromAccount,
  liabilityVault,
  liabilityAsset,
  liabilityAmount,
  currentDebt,
  toAccount,
  origin,
  slippage: 0.5,
});

const plan = sdk.executionService.planRepayWithSwap({
  account,
  swapQuote: quotes[0]!,
});
```

Rules:

1. Always re-quote close to execution time.
2. Validate quote-provider assumptions (quotes are best-first, but still simulate).
3. For full debt repay, set `liabilityAmount` to `currentDebt` with `TARGET_DEBT` mode.
4. Compare providers when building professional routing UIs.

Reference: `packages/euler-v2-sdk/docs/swaps.md`, `examples/execution/repay-with-swap-example.ts`, `examples/execution/swap-debt-example.ts`
