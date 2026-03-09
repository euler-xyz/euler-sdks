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
const result = await sdk.simulationService.simulateTransactionPlan(
  chainId,
  owner,
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

Gate execution on:

- `result.canExecute`
- `result.failedBatchItems`
- `result.accountStatusErrors` and `result.vaultStatusErrors`
- insufficiency fields (`insufficientWalletAssets`, allowances)

If simulation fails, decode and surface actionable messages rather than raw revert bytes.

Reference: `packages/euler-v2-sdk/docs/simulations-and-state-overrides.md`, `docs/decode-smart-contract-errors.md`, `examples/simulations/simulate-deposit-example.ts`
