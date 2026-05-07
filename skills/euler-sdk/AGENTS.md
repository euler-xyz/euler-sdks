# Euler SDK Agent Skill

**Version 1.1.1**
Euler Labs
March 2026

---

## Abstract

Integration guide for `euler-v2-sdk` focused on building production UIs, automation scripts, and developer tools. Covers service boundaries, entity population, transaction planning, approvals, simulation safety, caching via `buildQuery`, plugin integration, swap flows, and script templates.

---

## Table of Contents

1. [SDK Foundations](#1-sdk-foundations) — **HIGH**
2. [Execution Safety](#2-execution-safety) — **CRITICAL**
3. [Runtime Performance](#3-runtime-performance) — **HIGH**
4. [Integration Patterns](#4-integration-patterns) — **HIGH**

---

## 1. SDK Foundations

### 1.1 Architecture and Service Selection

Use `buildEulerSDK` as the composition root and route reads through top-level services:

- `accountService` for account/sub-account state
- `vaultMetaService` for mixed or unknown vault types
- `executionService` for planning/encoding tx batches
  - executes generic `TransactionPlan` items, including direct `contractCall` items
- `executionService` for plan simulation and pre-trade validation
- `swapService` for quotes and providers
- `oracleAdapterService` for oracle adapter metadata keyed by normalized `adapter.oracle` address
- `rewardsService` for reward reads and provider-specific reward claim planning
- `eulerLabelsService` plus exported label helpers for normalized products, Earn entries, notices, restrictions, and product/vault flags

Do not assume all vaults are `EVault`. Use `vaultMetaService` for polymorphic routing.
Service `fetch*` methods return diagnostics envelopes (`{ result, errors }`). Destructure `result` in examples and map `errors[].locations[]` by owner reference for UI diagnostics.

### 1.2 UI Data Population Contract

Computed account metrics depend on populated data. For portfolio screens, set:

- `populateVaults: true`
- `populateMarketPrices: true`
- `populateUserRewards: true`
- `vaultFetchOptions` with needed enrichments (`collaterals`, `strategyVaults`, `rewards`, `intrinsicApy`, `labels`)

Without these flags, metrics like `healthFactor`, `netAssetValueUsd`, and `roe` may be missing or incomplete.
APY/ROE fields exposed by vault and portfolio entities are percentage points (`5` = `5%`); raw reward campaign APRs remain decimal fractions until converted by computed breakdowns or UI helpers.

For batch vault reads (`fetchVaults`, `fetchVerifiedVaults`), results preserve input order and can include `undefined` entries for per-vault failures; use diagnostics locations with `owner.kind === "vault"` to map failures to addresses.

Use entity `populated` flags to verify enrichment state in UI logic:

- `account.populated.vaults | marketPrices | userRewards`
- `vault.populated.marketPrices | rewards | intrinsicApy | labels`
- `eVault.populated.collaterals`
- `eulerEarn.populated.strategyVaults`

---

## 2. Execution Safety

### 2.1 Planning and Approvals

Prefer `planX` APIs over `encodeX` for user-facing transaction flows. Resolve required approvals before sending EVC batch transactions.

Execution order:

1. Build plan (`planDeposit`, `planBorrow`, `planRepayWithSwap`, etc.) or reward claim plan in `rewardsService`
2. Resolve approvals with `resolveRequiredApprovals({ chainId, account, plan })`, or use `resolveRequiredApprovalsWithWallet({ chainId, wallet, plan })` when wallet data was already fetched
3. Execute `contractCall` items directly when present
4. Send `evcBatch` transaction(s)
5. Wait for receipts and refresh UI state

Use `mergePlans` to atomically combine user intents and `describeBatch` for previews.
`planX` methods group their encoded batch items into named operations inside `evcBatch` entries. Raw batch items remain valid batch entries for plugin prepends/appends. `mergePlans` preserves operation groupings and refuses to automatically merge `contractCall` items. `describeBatch` mirrors the input batch-entry shape: operation entries keep their name and contain decoded child items.

### 2.2 Simulation Gate

Simulate non-trivial plans before execution:

- swap-based repayment
- leverage / multiply
- debt migration
- liquidation flows

Block execution when `canExecute` is false or when status checks/insufficiency fields fail. Surface decoded errors to users.

---

## 3. Runtime Performance

### 3.1 buildQuery Caching Strategy

Decorate SDK `query*` methods via `buildQuery` (e.g., with React Query).

Use per-query stale times:

- hours (e.g. 12-24h): deployments, ABIs, token lists, static labels
- minutes: perspectives/providers/reward catalogs
- minutes: bundled intrinsic APY lookups such as `queryV3IntrinsicApy`
- 10-30s: account/vault/wallet state
- ~10s: swap quotes and Pyth update payloads

This keeps repeated service-level `fetch*` calls inexpensive.
By default, `buildEulerSDK` applies a 5s in-memory cache to decorated `query*` methods. Supplying a custom `buildQuery` replaces that default cache layer.

### 3.2 Plugins for Preconditions

Use plugins when vault interactions require side data/actions:

- `createPythPlugin` to inject price updates before reads/writes
- `createKeyringPlugin` to inject credential creation when required

Write-path plugins run automatically inside `simulateTransactionPlan`, `estimateGasForTransactionPlan`, and `executeTransactionPlan`. The account argument is `AddressOrAccount` (`Address | Account`); pass an `Account` when available so plugins can reuse state, or pass an address to let plugins fetch minimal data.

Keep plugin ordering deterministic. Use shared caching decorators for plugin query paths.

---

## 4. Integration Patterns

### 4.1 Swap Workflows

Pattern:

1. fetch quotes (`fetchDepositQuote`, `fetchRepayQuotes`)
2. pick quote (best-first ordering)
3. build plan (`planRepayWithSwap`, `planSwapCollateral`, `planSwapDebt`, `planMultiplyWithSwap`)
4. simulate
5. execute

Re-quote near submission time and compare providers for advanced routing UIs.

### 4.2 Scripts and Automation

Use SDK examples as templates:

- `packages/euler-v2-sdk/examples/execution/*` for transaction flows
- `packages/euler-v2-sdk/examples/simulations/*` for pre-checks
- `sdk.executionService.executeTransactionPlan(...)` for plugin processing + approval + Permit2 + EVC execution logic
- `packages/euler-v2-sdk/examples/run-examples.sh` for fork-based regression runs

Promote constants to config/env and add explicit chain/account flags in CLI tools.

---

## Primary References

- `packages/euler-v2-sdk/README.md`
- `packages/euler-v2-sdk/docs/basic-usage.md`
- `packages/euler-v2-sdk/docs/services.md`
- `packages/euler-v2-sdk/docs/entity-diagnostics.md`
- `packages/euler-v2-sdk/docs/execution-service.md`
- `packages/euler-v2-sdk/docs/simulations-and-state-overrides.md`
- `packages/euler-v2-sdk/docs/caching-external-data-queries.md`
- `packages/euler-v2-sdk/docs/labels.md`
- `packages/euler-v2-sdk/docs/plugins.md`
- `packages/euler-v2-sdk/docs/swaps.md`
- `packages/euler-v2-sdk/examples/react-sdk-example/src/context/SdkContext.tsx`
- `packages/euler-v2-sdk/examples/react-sdk-example/src/queries/sdkQueries.ts`
- `packages/euler-v2-sdk/examples/react-sdk-example/src/utils/txProgress.ts`
