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
import { SwapperMode } from "euler-v2-sdk";

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
  swapperMode: SwapperMode.TARGET_DEBT,
  slippage: 0.5,
});

const plan = sdk.executionService.planRepayWithSwap({
  account,
  swapQuote: quotes[0]!,
});
```

Rules:

1. Always re-quote close to execution time.
2. Use the planner that matches the quote verifier mode: `planSwapFromWallet` for `transferMin`, `planDepositWithSwapFromWallet` / `planSwapAndBorrowFromWallet` / `planSwapCollateral` for `skimMin`, and `planRepayWithSwap` / `planSwapDebt` / `planSwapAndRepayFromWallet` for `debtMax`.
3. For full debt repay, set `liabilityAmount` to `currentDebt` with `SwapperMode.TARGET_DEBT`.
4. For wallet-sourced repay, request the quote with a real `fromVault` and `fromAccount` as the router sweep context, then let `planSwapAndRepayFromWallet` pull the input token from the wallet. Use `BigInt(quote.amountIn)` for exact-input quotes and `BigInt(quote.amountInMax || quote.amountIn)` for target-debt quotes.
5. For same-asset debt migration, ensure the destination debt vault has positive-LTV collateral enabled on the account before executing the migration plan.
6. Validate quote-provider assumptions (quotes are best-first, but still simulate).
7. Compare providers when building professional routing UIs.

Reference: `packages/euler-v2-sdk/docs/swaps.md`, `examples/execution/repay-with-swap-example.ts`, `examples/execution/swap-and-borrow-from-wallet-example.ts`, `examples/execution/swap-and-repay-from-wallet-example.ts`, `examples/execution/withdraw-and-swap-example.ts`, `examples/execution/redeem-and-swap-example.ts`
