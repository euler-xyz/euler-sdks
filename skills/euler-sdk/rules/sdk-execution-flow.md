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

const resolved = await sdk.executionService.resolveRequiredApprovals({
  chainId,
  account: owner,
  plan,
});

// Execute required approvals first, then handle each executable item:
// - contractCall: send directly
// - evcBatch: send through EVC.batch
```

Execution checklist:

1. Build plan with `planX`.
2. Pass the plan to `sdk.executionService.executeTransactionPlan(...)`; it applies configured plugins before resolving approvals and sending transactions.
3. Use `onProgress` to surface approval, Permit2 signature, direct call, EVC batch, and completion states.
4. Wait for the returned receipts and refetch dependent queries.
5. Decode contract errors for user-facing diagnostics.

`executeTransactionPlan`, `simulateTransactionPlan`, and `estimateGasForTransactionPlan` accept `AddressOrAccount` (`Address | Account`) for the account argument. Pass an `Account` when the caller already has account state that plugins can reuse; pass an address when plugin-side minimal fetching is preferable.

Use `mergePlans` to atomically combine multiple intents and `describeBatch` for previews/logging.
Planner-created `evcBatch` entries contain named operations (`{ type: "operation", name, items }`). Keep those groups intact in previews and merge flows. Raw `EVCBatchItem` entries are still valid for low-level utilities and plugin-inserted setup calls. Use `convertBatchItemsToPlan(items, operationName)` when a raw encoded batch should be named as one operation; omit `operationName` to preserve the raw item array.

Reference: `packages/euler-v2-sdk/docs/execution-service.md`, `packages/euler-v2-sdk/src/services/executionService/executionService.ts`, `examples/react-sdk-example/src/utils/txProgress.ts`
