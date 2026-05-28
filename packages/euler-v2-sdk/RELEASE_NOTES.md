# euler-v2-sdk v0.2.8-beta

## Summary

This beta release focuses on high-fanout simulation performance, reward accuracy, and borrow-plan correctness. It adds plugin prefetching, state-override wallet snapshots, ERC20 slot hints, viewer-aware rewards, borrow collateral and looping reward attribution, stale-controller-safe borrow sub-account selection, and Pyth Hermes fetch customization.

## Highlights

- `executionService.prefetchPluginDataForPlan(...)` resolves plugin payloads once per form or quote sweep, and Pyth/Keyring consume the payload through the existing prepare, simulate, estimate, and execute paths.
- `SimulationStateOverrideOptions` accepts `noBalanceOverride`, `noAllowanceOverride`, `wallet`, and `slotHints` so callers can reuse validated wallet state and avoid repeated balance, allowance, and slot-probing RPCs.
- `fetchErc20SlotHints`, `fetchErc20SlotHintsBatch`, `primeSlotHintsCache`, and related helpers are exported for precomputing ERC20 balance and allowance storage slots.
- Rewards are viewer-aware through `VaultRewardInfo.getActiveCampaigns({ viewer })` and `getTotalRewardsApr({ viewer })`; the default predicate keeps headline APR visible without a connected viewer.
- Account and portfolio yield calculations include eligible `BORROW_COLLATERAL` and `LOOPING` rewards when borrow-side collateral and multiplier context is available.
- `accountService.resolveNewSubAccount(...)` refreshes candidate sub-account snapshots before borrow planning so stale cached controllers do not cause the SDK to reuse an incompatible account.
- `createPythPlugin({ fetchFn })` lets apps route Hermes requests through a custom fetcher, and Pyth feed collection now uses route-filtered oracle adapters.
- Approval resolution skips Permit2 when direct vault allowance already covers the required spend, avoiding unnecessary Permit2 approval/signature prompts.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
