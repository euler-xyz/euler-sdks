# Euler Lite execution reachability: E01-E14

Primary source: public master `e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1`, SDK published `3.3.0`. The previously reviewed development commit `fffb1cfcb964a236cc4e92e5d037c70ad1fd0207` adds preview expectation checks; public master retains the omitted-effect count guard used here. Package parity/integrity is recorded separately in `lite-sdk-package-validation.json`.

Runtime evidence: `lite-execution-repro.mjs` imports actual public-master Lite intent factory/compiler and installed SDK 3.3.0 (byte-identical to verified package). Controlled E01/E06/E11 assertions passed; output in `lite-execution-repro.json`. These tests use synthetic plan/wallet state, not browser clicks, a fork, or live transactions. No application code was changed.

## E01 — reachable-but-main-cart-guarded

Lite calls the affected merge method, but its main multi-intent compiler detects omitted calls.

**Trigger:** Queue plans containing repeated or opposing collateral/controller operations so the SDK normalizer removes calls.

**Lite production effect:** Cart previews can lose operations or fail layer mapping; authoritative multi-intent review rejects omitted effects before signing. Do not carry over the generic SDK claim of a silently wrong submitted cart transaction.

**Limits:** Controlled compiler fixtures with two EVC transitions and with two actual SDK borrow plans through Lite public planner compiler, not a browser-click reproduction. Single refinance intents merge internally before the outer count is measured (lite-compilers.ts:97); the guard cannot establish safety of every internal merge, but no concrete damaging normal refinance sequence was established.

Evidence: [useTxBatch.ts:1763](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useTxBatch.ts:1763), [compiler.ts:85](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/compiler.ts:85), [compiler.ts:130](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/compiler.ts:130), [lite-compilers.ts:78](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/lite-compilers.ts:78).

## E02 — not-demonstrated-in-normal-ui

Normal Lite plans compose one main EVC batch; prerequisite and cleanup transactions are handled separately.

**Trigger:** SDK issue needs multiple separate EVC batches fed to one SDK simulation.

**Lite production effect:** No normal Lite UI reproduction established. An approval transaction plus one EVC batch is not the reported two-EVC-health-boundary counterexample.

**Limits:** Manual/custom plans could expose it; SDK merge collapses supported cart plans to one main EVC batch.

Evidence: [compiler.ts:85](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/compiler.ts:85), [prepared-plan.ts:439](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/materialization/prepared-plan.ts:439), [useReviewedExecution.ts:456](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:456).

## E03 — blocked-by-lite-materialization

Lite executes sealed materialized requests rather than the vulnerable raw execute workflow.

**Trigger:** An orphan permit or wrong-chain direct call in a manually authored plan.

**Lite production effect:** Preparation rejects the invalid plan before wallet signing/submission; the reported late raw-execution approval side effect is not reached.

**Limits:** Not a claim that every wallet interaction in Lite is immune to all late failures.

Evidence: [useReviewedExecution.ts:637](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:637), [prepared-plan.ts:559](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/materialization/prepared-plan.ts:559), [prepared-plan.ts:575](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/materialization/prepared-plan.ts:575).

## E04 — not-demonstrated-in-normal-ui

Cart merge aggregates same-key approvals and Lite uses materialized execution.

**Trigger:** Two unresolved permits with identical owner/token/spender within one executed batch.

**Lite production effect:** Normal merged cart requests do not preserve duplicate same-key approval requirements. No current UI flow producing this raw-execution nonce failure was established.

**Limits:** Slot preparation itself reads each nonce independently; a future/custom single-intent plan with duplicate keys would need rechecking. Do not label all repeated explicit materialized nonces invalid.

Evidence: [compiler.ts:85](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/compiler.ts:85), [useReviewedExecution.ts:385](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:385), [signature-slots.ts:106](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/materialization/signature-slots.ts:106), [useReviewedExecution.ts:637](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:637).

## E05 — blocked-by-lite-context-checks

The authoritative Lite preparation binds intent, account snapshot, connected account and chain.

**Trigger:** Contradictory account/chain data supplied to an SDK entry point.

**Lite production effect:** The reviewed UI path rejects the mismatch before materialization and dispatch instead of trusting conflicting snapshots.

**Limits:** These checks establish the reviewed execution path, not every asynchronous preview/cache operation.

Evidence: [useReviewedExecution.ts:267](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:267), [useReviewedExecution.ts:293](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:293), [lite-compilers.ts:48](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/lite-compilers.ts:48), [prepared-plan.ts:376](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/materialization/prepared-plan.ts:376).

## E06 — reachable

Raw URL casing can reach allowance resolution; more severe borrow/repay casing variants are not demonstrated with normally normalized entity data.

**Trigger:** Open a valid lowercased /earn/<vault> or /lend/<vault> URL for a vault with checksum capitals and existing approval.

**Lite production effect:** The existing allowance is missed because its dictionary key is checksummed, resulting in unnecessary approval/signature prompts. This can cost gas if submitted. Normal account/vault adapters normalize addresses, which masks several other casing subcases.

**Limits:** Actual Lite intent factory plus published resolver tested with controlled wallet data: lowercase2 approval steps versus checksum0. No browser or chain transaction was submitted.

Evidence: [index.vue:42](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/index.vue:42), [index.vue:172](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/index.vue:172), [index.vue:105](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/lend/[vault]/index.vue:105), [canonical.ts:134](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/domain/canonical.ts:134), [lite-compilers.ts:100](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/lite-compilers.ts:100).

## E07 — not-used

Lite exposes deposits by asset amount, not the SDK planMint share-quantity planner.

**Trigger:** A call to planMint with a finite approval estimate.

**Lite production effect:** No normal UI path to the mint-rounding bug was found.

**Limits:** Repository-wide production-code search found no planMint caller; this is an SDK integration concern outside current Lite flows.

Evidence: [lite-compilers.ts:9](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/lite-compilers.ts:9), [lite-compilers.ts:171](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/lite-compilers.ts:171), [index.vue:172](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/index.vue:172).

## E08 — avoided-by-lite-withdraw-choice

Earn partial withdrawal uses withdraw(assets); Max uses redeem(shares).

**Trigger:** The SDK bug requires planRedeem({assets}), which the normal Earn page does not call.

**Lite production effect:** The reported over-redemption/insufficient-shares failure is not reached by current Earn withdrawal UI. Earn display estimate accuracy remains a separate issue.

**Limits:** The shared wrapper technically permits assets-only redeem, but production callers choose the safe branches. Asset-based display conversions must not be conflated with executable E08.

Evidence: [withdraw.vue:143](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/[subAccount]/withdraw.vue:143), [withdraw.vue:150](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/[subAccount]/withdraw.vue:150), [useEulerTx.ts:1004](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerTx.ts:1004), [useEulerTx.ts:1039](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerTx.ts:1039).

## E09 — conditional-no-specific-failing-ui-path

Lite uses SDK dependency inference, but ordinary collateral/controller changes also contain vault operations that mark affected accounts.

**Trigger:** An EVC-only transition or uncovered account dependency must survive normal UI planning without a companion vault call that supplies the same dependency.

**Lite production effect:** The SDK mechanism is in the call chain, but no concrete current UI operation demonstrating a missed necessary update or read was established. Avoid calling generic standalone EVC fixtures a Lite reproduction.

**Limits:** Disable collateral UI transfers shares from the same account and then disables collateral. Standalone cleanup is registered/exported but no page creates a cleanup intent; reorder/raw EVC controller calls were not found. Nested/plugin/custom paths are not exhaustively proved.

Evidence: [index.vue:681](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/index.vue:681), [index.vue:686](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/index.vue:686), [lite-compilers.ts:156](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/lite-compilers.ts:156), [useReviewedExecution.ts:369](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:369).

## E10 — not-demonstrated-with-normal-provider

Requires malformed decoded provider output or an incompatible configured contract.

**Trigger:** A custom provider bypasses normal ABI decoding or configured EVC returns semantically wrong arrays.

**Lite production effect:** Normal Lite RPC use does not establish this defensive-boundary trigger.

**Limits:** The SDK fixture mocked decoded values; no corrupt real RPC response through Lite and viem was reproduced.

Evidence: [useEulerSdk.ts:253](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:253), [useReviewedExecution.ts:456](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:456).

## E11 — reachable-with-existing-allowance-state

Lite deliberately ignores aggregate allowance diagnostics, but invokes the affected resolver.

**Trigger:** An Earn vault has enough direct approval, an unexpired sufficient Permit2 spender authorization, but insufficient ERC20 approval to Permit2.

**Lite production effect:** UI can prepare and simulate with synthetic allowances without adding the missing real Permit2 approval; the deposit fails: wallet gas estimation may block before broadcast, otherwise Earn reverts. No automatic route repair or token-to-Permit2 allowance guard exists in the inspected final dispatch path. The separate SDK false-rejection from requiring both routes is masked by Lite projection.

**Limits:** Controlled published resolver reproduction with direct100, token-to-Permit2 95, spenderPermit2 1000 unexpired yields0 repairs using Lite finite settings. Actual Earn contract route established in prior pinned source review, not executed here. Existing state can result from prior authorization/revocation; no live affected wallet identified.

Evidence: [index.vue:172](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/index.vue:172), [useReviewedExecution.ts:374](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:374), [useReviewedExecution.ts:456](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:456), [euler-projection.ts:23](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/simulation/euler-projection.ts:23), [useTransactionPlanSimulation.ts:26](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useTransactionPlanSimulation.ts:26), [eoa.ts:74](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/adapters/eoa.ts:74), [eoa.ts:85](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/adapters/eoa.ts:85), [useReviewedExecution.ts:652](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:652).

## E12 — not-used-by-normal-deposit-max

Lite deposit Max supplies a finite selected wallet amount; it does not encode deposit(maxUint256).

**Trigger:** The reported bug needs maxUint256 funding metadata plus a deposit-all sentinel.

**Lite production effect:** No current ordinary Lend/Earn deposit UI reproduction. Max repayment and Max share redemption use different semantics and are not evidence for this deposit bug.

**Limits:** Cart simulation does enable balance overrides, so a future/manual sentinel deposit could reach it. Current code searches found sentinels only for repay, transfer, share redeem and cap checks.

Evidence: [index.vue:624](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/lend/[vault]/index.vue:624), [index.vue:88](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/lend/[vault]/index.vue:88), [index.vue:175](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/index.vue:175), [useBorrowForm.ts:978](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/borrow/useBorrowForm.ts:978).

## E13 — not-used-fields

Lite uses state overrides but inspected built-in migration/approval overrides contain stateDiff, not full state or code.

**Trigger:** A caller supplies a code replacement or full storage replacement.

**Lite production effect:** The confirmed code/full-storage-loss bug has no identified normal Lite input. Existing duplicate stateDiff slots are handled by viem and must not be counted as the same defect.

**Limits:** Published positionMigrationService.js:454-592 emits stateDiff only; absence applies to inspected built-in routes.

Evidence: [useReviewedExecution.ts:458](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:458), [migration-compiler.ts:45](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/migration-compiler.ts:45), [useTxBatch.ts:1756](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useTxBatch.ts:1756).

## E14 — option-not-enabled

Lite wrapper exposes noAllowanceOverride but no production caller sets it true.

**Trigger:** Simulation invoked with noAllowanceOverride:true.

**Lite production effect:** No current Lite UI reproduction; common noBalanceOverride:true is a separate flag.

**Limits:** Repository-wide search found only option declaration/pass-through, not activation.

Evidence: [useStateOverrideOptions.ts:141](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useStateOverrideOptions.ts:141), [useStateOverrideOptions.ts:146](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useStateOverrideOptions.ts:146), [index.vue:88](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/lend/[vault]/index.vue:88).

Final dispatch cross-check for E11: [published SDK materialized execution](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/executionService/materializedExecution.js:384) optionally rechecks Permit2 nonces for supplied signature slots; it does not validate or repair token-to-Permit2 allowance. Lite finalizes the vector with empty signature slots and performs any relevant nonce checks itself. Resolver-zero approvals therefore remain unrepaired. Wallet estimation may reject before broadcast; if broadcast with unchanged failing allowance state, Earn reverts.
