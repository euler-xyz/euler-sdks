---
title: Pre-Execution Simulation and Safety Gates
impact: CRITICAL
impactDescription: Catches failing routes and unhealthy positions before users sign
tags: simulation, batchSimulation, safety, health, state-overrides
---

## Pre-Execution Simulation and Safety Gates

Simulate any non-trivial plan before execution, especially swaps, leverage, debt migration, and liquidation paths.

**Correct simulation flow:**

```typescript
const result = await sdk.executionService.simulateTransactionPlan(
  chainId,
  ownerOrAccount,
  plan,
  {
    stateOverrides: true,
    accountFetchOptions: {
      populateVaults: true,
      populateMarketPrices: true,
      populateUserRewards: true,
      vaultFetchOptions: {
        populateMarketPrices: true,
        populateRewards: true,
        populateIntrinsicApy: true,
      },
    },
  },
);

if (!result.canExecute) {
  throw new Error("Simulation failed safety checks");
}
```

Simulation and gas estimation use the same plugin processing path as execution. Their account argument is `AddressOrAccount` (`Address | Account`), so passing an already-fetched account can avoid duplicate plugin account fetches.

Gate execution on:

- `result.canExecute`
- `result.failedBatchItems`
- `result.accountStatusErrors` and `result.vaultStatusErrors`
- insufficiency fields (`insufficientWalletAssets`, allowances)

If simulation fails, decode and surface actionable messages rather than raw revert bytes.

For UI fan-outs that simulate N candidate plans per user action (swap-quote sweeps, leverage explorers), avoid blowing up RPC + Hermes traffic:

- Pass `stateOverrideOptions` (`SimulationStateOverrideOptions`) to skip overrides the form already validated: `noBalanceOverride: true` when the form gates submit on wallet balance, `wallet.balances`/`wallet.allowances` from the snapshot the form already holds, and `slotHints` pre-fetched once per token with `fetchErc20SlotHints(provider, token, { allowanceSpender })`.
- Compute `prefetch` once per sweep with `executionService.prefetchPluginDataForPlan(plan, account, chainId)` and thread it through every `prepareTransactionPlan` / `simulatePreparedTransactionPlan` / `estimateGasForPreparedTransactionPlan` / `executePreparedTransactionPlan` call. The Pyth / Keyring plugin work happens once instead of N times.

These options are additive and degrade gracefully — omit them and the SDK falls back to full derivation + per-call plugin fetch.

Reference: `packages/euler-v2-sdk/docs/simulations-and-state-overrides.md`, `docs/execution-service.md`, `docs/decode-smart-contract-errors.md`, `examples/simulations/simulate-deposit-example.ts`
