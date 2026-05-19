# euler-v2-sdk v0.2.4-beta

## Summary

This beta release adds a prepared-plan envelope to `ExecutionService` so consumers can run plugins and required-approval resolution once per plan and reuse the result across simulate and execute. The two adjacent fixes — short-circuit `resolveRequiredApprovals` for plans with no approvals, and a fast path in `deriveStateOverrides` for plans with no balance/approval requirements — remove redundant chain reads from withdraw and redeem flows.

## Highlights

- Added `TransactionPlanPrepared` envelope (carries `plan`, `chainId`, `account`, `usePermit2`, `unlimitedApproval`) and the `isPreparedTransactionPlan` type guard.
- Added `ExecutionService.prepareTransactionPlan(args)` — runs `processPlanPlugins` + `resolveRequiredApprovals` once and returns the envelope.
- Added `ExecutionService.simulatePreparedTransactionPlan(prepared, options?)` and `ExecutionService.executePreparedTransactionPlan(args)` — consume the envelope and skip the plugin pipeline (and, for execute, the approval re-resolution).
- `ExecutionService.resolveRequiredApprovals` early-returns when the plan has no `requiredApproval` items, avoiding a redundant `walletService.fetchWallet` call.
- `deriveStateOverrides` short-circuits when `extractBalanceRequirements` and `extractApprovalRequirements` both yield empty arrays — emits only the synthetic native-balance override, no provider lookup, no per-token reads.

The original `simulateTransactionPlan` and `executeTransactionPlan` signatures are unchanged; the prepared variants are additive.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
