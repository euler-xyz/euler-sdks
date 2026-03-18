---
title: Transaction Planning, Approvals, and EVC Batch Execution
impact: CRITICAL
impactDescription: Prevents reverted transactions and broken wallet UX
tags: execution, planX, approvals, permit2, evc
---

## Transaction Planning, Approvals, and EVC Batch Execution

Prefer `planX` over `encodeX` for app flows. `planX` includes required approvals and context-driven execution decisions.
For reward claims, use `rewardsService.buildClaimPlan(s)` instead of adding provider-specific claim logic to `executionService`.

**Incorrect (encoding raw calls but skipping approvals):**

```typescript
const batchItems = sdk.executionService.encodeDeposit({ ...args });
// WRONG: no approval resolution; tx may revert on allowance
```

**Correct (plan + resolve + execute):**

```typescript
const plan = sdk.executionService.planDeposit({
  account,
  vault,
  asset,
  amount,
  receiver,
  enableCollateral: true,
});

const resolved = await sdk.executionService.resolveRequiredApprovalsWithWallet({
  chainId,
  owner,
  transactionPlan: plan,
  walletClient,
});

// Execute required approvals first, then handle each executable item:
// - contractCall: send directly
// - evcBatch: send through EVC.batch
```

Execution checklist:

1. Build plan with `planX`.
2. Resolve approvals (`approve` and/or Permit2 signing path).
3. Execute `contractCall` items directly when present.
4. Encode/send EVC batch (`executionService.encodeBatch`) for `evcBatch` items.
5. Wait for receipt and refetch dependent queries.
6. Decode contract errors for user-facing diagnostics.

Use `mergePlans` to atomically combine multiple intents and `describeBatch` for previews/logging.

Reference: `packages/euler-v2-sdk/docs/execution-service.md`, `examples/utils/executor.ts`, `react-sdk-example/src/utils/txExecutor.ts`
