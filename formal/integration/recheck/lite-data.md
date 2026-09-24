# Euler Lite reachability: D01–D15

Inspected public Euler Lite master `e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1`, with its published SDK `3.3.0`. Relevant data/UI files were unchanged from the earlier pinned Lite `fffb1cfcb964a236cc4e92e5d037c70ad1fd0207`. Root package parity evidence is in `lite-sdk-package-validation.json`. This is source reachability plus eight synthetic published-package reproductions. **No browser or live production incident was reproduced.**

Important narrowing: normal portfolio account reads use onchain adapters, avoiding D05/D06 in that main display path; a fast V3 planning snapshot can still transiently carry those defects. Ordinary Earn partial withdrawals use exact withdraw and maximum withdrawals use explicit shares, bypassing D01/E08. Reviewed execution rehydrates required subaccounts onchain.

Published-package test: `node formal/integration/recheck/lite-data-repro.mjs [installed-SDK-directory]`. Results are in `lite-data-repro-results.json`. These fixtures demonstrate SDK mechanisms, not all UI triggers or current deployed configurations.

## D01 — no-normal-ui-path

Ordinary Earn withdrawal bypasses the defective assets-to-redeem-shares path.

**Trigger:** The SDK defect requires planRedeem with an assets argument, or directly calling Earn.previewWithdraw.

**Production effect:** No normal Earn withdrawal over-redemption demonstrated in Lite.

**Mitigation/boundary:** Earn partial withdrawal compiles planWithdraw({assets}); max compiles planRedeem({shares}). Batch/review intentions preserve that distinction. Other previewWithdraw use is EVK-only repayment; Earn is excluded from savings repayment.

**Reproduction:** SDK fixture reproduces wrong preview at earned exchange rate, but triggering it from Lite requires changing/injecting a planner intent rather than following the normal UI.

**Lite evidence:** [pages/earn/[vault]/[subAccount]/withdraw.vue:145](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/[subAccount]/withdraw.vue:145), [pages/earn/[vault]/[subAccount]/withdraw.vue:182](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/earn/[vault]/[subAccount]/withdraw.vue:182), [composables/useEulerTx.ts:1004](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerTx.ts:1004), [features/reviewed-execution/planning/lite-compilers.ts:107](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/planning/lite-compilers.ts:107), [composables/useRepaySavingsOptions.ts:10](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useRepaySavingsOptions.ts:10).

## D02 — reachable-state-dependent

SDK currentLiquidationLTV reaches Lite vault and market pair displays.

**Trigger:** A decreasing liquidation-LTV ramp at a fractional-basis-point time, or an increased target with ramp metadata.

**Production effect:** Vault/market collateral threshold and ramp indicators can differ from EVK; the runtime decreasing-ramp fixture gives 0.8333333333 versus 0.8333. At displayed two-decimal-percent precision this can round to the same label, so visibility depends on rounding position.

**Mitigation/boundary:** Live position risk helpers prefer accountLiquidationLTV from AccountLens over per-vault fallback. Therefore this is not proof every Lite account health metric uses the bad getter.

**Reproduction:** Load a vault/pair fixture with initial 8500, target 8000, target time 103, duration 3, timestamp 101. Inspect underlying SDK field and collateral detail; for a visible display difference choose a rounding boundary. No deployed ramp fixture established.

**Lite evidence:** [components/entities/vault/overview/VaultOverviewBlockBorrow.vue:176](/private/tmp/euler-sdk-integration-review/euler-lite-master/components/entities/vault/overview/VaultOverviewBlockBorrow.vue:176), [components/entities/vault/overview/VaultOverviewPairBlockGeneral.vue:30](/private/tmp/euler-sdk-integration-review/euler-lite-master/components/entities/vault/overview/VaultOverviewPairBlockGeneral.vue:30), [utils/borrow-pair.ts:37](/private/tmp/euler-sdk-integration-review/euler-lite-master/utils/borrow-pair.ts:37), [utils/ltv.ts:8](/private/tmp/euler-sdk-integration-review/euler-lite-master/utils/ltv.ts:8), [composables/useTxBatch.ts:1044](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useTxBatch.ts:1044).

## D03 — reachable-configuration-dependent

Position risk prices call the affected SDK high-decimal getter.

**Trigger:** An EVK UoA has decimals above 18 and a usable oracle price.

**Production effect:** The on-chain price calculation throws; affected position risk display/update can fail.

**Mitigation/boundary:** Ordinary 18-or-fewer-decimal UoAs do not trigger it. No affected deployed vault was found.

**Reproduction:** Use a 24-decimal UoA fixture in a position; getAssetUsdPrice(vault,"on-chain") reaches assetRiskPrice. Published-package runtime confirms RangeError, not browser rendering.

**Lite evidence:** [utils/sdk-prices.ts:141](/private/tmp/euler-sdk-integration-review/euler-lite-master/utils/sdk-prices.ts:141), [utils/sdk-prices.ts:162](/private/tmp/euler-sdk-integration-review/euler-lite-master/utils/sdk-prices.ts:162), [pages/position/[number]/index.vue:357](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/index.vue:357), [pages/position/[number]/index.vue:570](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/index.vue:570).

## D04 — reachable-data-only

Incorrect owner-mode flags enter Lite account objects, but no UI decision consumer was found.

**Trigger:** Only secondary subaccounts discovered; owner lockdown or permit-disabled flag true.

**Production effect:** SDK Account state is wrong and copied into batch snapshots. An additional Lite effect from these specific wrong flags was not established.

**Mitigation/boundary:** Repository search found only copying of isLockdownMode/isPermitDisabledMode in useTxBatch, no Lite gate or flag display. Onchain enforcement remains.

**Reproduction:** Runtime adapter fixture with secondary-only discovery and both EVC flags true returns both false. Inspect Account object through the normal onchain loader; do not call it a reproduced UI bypass.

**Lite evidence:** [composables/useEulerAccount.ts:137](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:137), [composables/useFreshAccount.ts:71](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useFreshAccount.ts:71), [composables/useTxBatch.ts:1322](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useTxBatch.ts:1322), [composables/useTxBatch.ts:1606](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useTxBatch.ts:1606).

## D05 — conditionally-reachable-planning-state

Known balances disappear from a fast planning snapshot.

**Trigger:** V3 returns balance rows with null optional subAccount metadata; V3-enabled fast source is used and finishes before fresh onchain or onchain fails.

**Production effect:** positions becomes empty. Forms/non-authoritative previews can observe incorrect planning state. This is not the normal displayed-portfolio data path.

**Mitigation/boundary:** useEulerAccount uses fresh onchain for ordinary portfolio. useFreshAccount races fast/fresh, always preferring successful fresh. Reviewed execution then hydrates required subaccounts onchain before final compilation. Hydration uses known vaults plus controller/collateral state; do not claim it discovers every missing standalone deposit.

**Reproduction:** Published-package degraded-response fixture reproduces underlying adapter defect. In local Lite intercept V3 response and delay/fail onchain account loading; inspect usePlanAccount/form preview, then release onchain and confirm replacement. No browser run performed.

**Lite evidence:** [composables/useEulerSdk.ts:133](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:133), [composables/useFreshAccount.ts:41](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useFreshAccount.ts:41), [composables/useFreshAccount.ts:59](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useFreshAccount.ts:59), [composables/usePlanAccount.ts:14](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/usePlanAccount.ts:14), [composables/useEulerAccount.ts:137](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:137), [composables/useReviewedExecution.ts:197](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:197), [composables/useReviewedExecution.ts:219](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:219), [composables/useReviewedExecution.ts:292](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:292).

## D06 — conditionally-reachable-planning-state

Unknown debt becomes zero in a fast planning snapshot.

**Trigger:** V3 returns valid subAccount metadata but null borrowed/shares/assets; V3-enabled fast source is used and finishes before fresh onchain or onchain fails.

**Production effect:** defined Account with borrowed 0 suppresses the configured fallback. Forms/non-authoritative previews can observe incorrect planning state. This is not the normal displayed-portfolio data path.

**Mitigation/boundary:** useEulerAccount uses fresh onchain for ordinary portfolio. useFreshAccount races fast/fresh, always preferring successful fresh. Reviewed execution then hydrates required subaccounts onchain before final compilation. Hydration uses known vaults plus controller/collateral state; do not claim it discovers every missing standalone deposit.

**Reproduction:** Published-package degraded-response fixture reproduces underlying adapter defect. In local Lite intercept V3 response and delay/fail onchain account loading; inspect usePlanAccount/form preview, then release onchain and confirm replacement. No browser run performed.

**Lite evidence:** [composables/useEulerSdk.ts:133](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:133), [composables/useFreshAccount.ts:41](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useFreshAccount.ts:41), [composables/useFreshAccount.ts:59](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useFreshAccount.ts:59), [composables/usePlanAccount.ts:14](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/usePlanAccount.ts:14), [composables/useEulerAccount.ts:137](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:137), [composables/useReviewedExecution.ts:197](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:197), [composables/useReviewedExecution.ts:219](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:219), [composables/useReviewedExecution.ts:292](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useReviewedExecution.ts:292).

## D07 — reachable-error-dependent

Normal onchain portfolio discovery accepts a parseable subgraph error as empty.

**Trigger:** Subgraph/internal proxy returns JSON errors, missing data, or a parseable HTTP failure.

**Production effect:** Portfolio can become empty instead of showing an account-discovery failure; planners also use this discovery.

**Mitigation/boundary:** Socket errors and invalid JSON already throw. Proxy preserves upstream status/body and does not validate GraphQL success, so it does not block this mechanism. SDK creates an empty Account for unavailable discovery.

**Reproduction:** Intercept POST /api/internal/proxy/subgraph/{chainId} with 200 {"errors":[{"message":"indexing unavailable"}]} and refresh portfolio. Published-package adapter test returns {} with no rejection; browser action not executed.

**Lite evidence:** [composables/useEulerAccount.ts:137](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:137), [composables/useEulerSdk.ts:231](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:231), [server/api/internal/proxy/subgraph/[chainId].post.ts:100](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/api/internal/proxy/subgraph/[chainId].post.ts:100).

## D08 — no-normal-ui-path

The required bundle of more than 100 distinct owners is not generated by ordinary Lite.

**Trigger:** More than 100 matching indexed owner-prefix entities requested on same-chain SDK instance within its bundling window.

**Production effect:** No ordinary single-wallet/spy-account screen trigger found.

**Mitigation/boundary:** Lite account loaders each request one effective owner. Server SDK is used for vault/label reads, not mass-account discovery; separate browser tabs have separate SDK instances.

**Reproduction:** Would require a custom stress harness invoking SDK discovery for 101 owners in one instance; not a natural Lite repro.

**Lite evidence:** [composables/useEulerAccount.ts:152](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:152), [composables/useFreshAccount.ts:62](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useFreshAccount.ts:62), [server/utils/sdk-server.ts:4](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/utils/sdk-server.ts:4).

## D09 — no-normal-ui-path

Lite does not supply invalid fractional/NaN pagination configuration.

**Trigger:** Custom SDK batchSize between 0 and 1 or oracle pageSize NaN.

**Production effect:** No default Lite trigger found.

**Mitigation/boundary:** Browser/server builder configurations omit these settings; oracle catalogue call supplies active:true only.

**Reproduction:** Requires changing app configuration/code or directly constructing malformed SDK settings; no browser reproduction expected from normal controls.

**Lite evidence:** [composables/useEulerSdk.ts:191](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:191), [server/utils/sdk-server.ts:104](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/utils/sdk-server.ts:104), [composables/useEulerOracleAdapters.ts:168](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerOracleAdapters.ts:168).

## D10 — no-normal-ui-path

First-party V3 classification uses supported canonical types.

**Trigger:** Custom API emits EulerEarn/SecuritizeCollateral aliases without recognized resource fallback.

**Production effect:** No current first-party Lite classification failure established.

**Mitigation/boundary:** Normal API emits earn/evk/securitize. Lite can be pointed at custom backends, making it a compatibility case.

**Reproduction:** Return an alternate alias without resource from a custom/mock V3 resolver; this changes the upstream contract versus inspected first-party producer.

**Lite evidence:** [composables/useEulerSdk.ts:136](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:136), [composables/useEulerSdk.ts:192](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:192).

## D11 — reachable-campaign-dependent

Portfolio headline APY/ROE uses the deficient SDK aggregate; position rows use the richer getter.

**Trigger:** An eligible BORROW_COLLATERAL or LOOPING reward on a visible position.

**Production effect:** Portfolio headline understates rewards relative to the same position. Runtime single-position fixture shows 1% headline versus 2.5% position APY. Payouts are unchanged.

**Mitigation/boundary:** Ordinary BORROW-only rewards do not require omitted context. Live campaign eligibility/economics were not attested.

**Reproduction:** Use the committed fixture with 200 supplied, 100 borrowed, 5% supply, 8% borrow and 3% collateral-specific reward. Published 3.3.0 aggregate 1% versus position 2.5% confirmed; Lite consumes these exact getters. No browser execution.

**Lite evidence:** [composables/useEulerAccount.ts:242](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:242), [pages/portfolio.vue:167](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/portfolio.vue:167), [pages/portfolio.vue:272](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/portfolio.vue:272), [components/entities/portfolio/PortfolioBorrowItem.vue:285](/private/tmp/euler-sdk-integration-review/euler-lite-master/components/entities/portfolio/PortfolioBorrowItem.vue:285).

## D12 — no-normal-ui-path

Repeated population of the same Account entity was not found in Lite.

**Trigger:** Call Account.populateMarketPrices twice on same instance after price disappears/debt changes.

**Production effect:** The SDK defect is real, but an ordinary Lite lifecycle reaching that exact mechanism was not established.

**Mitigation/boundary:** AccountService constructs a fresh Account on each fetch. Lite replaces returned portfolio, and batch projections create new Account objects. Hydrated vault population alone is not the stale Account-field defect.

**Reproduction:** SDK same-instance fixture can reproduce; would require an added direct Account.populateMarketPrices call in Lite. Do not equate any stale display with this finding.

**Lite evidence:** [composables/useEulerAccount.ts:152](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:152), [composables/useEulerAccount.ts:169](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:169), [composables/useTxBatch.ts:1603](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useTxBatch.ts:1603), [composables/useVaults.ts:680](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useVaults.ts:680).

## D13 — reachable-error-dependent

Pyth-enriched onchain account/vault reads can hide enrichment failure diagnostics.

**Trigger:** Pyth/plugin prepend attempted, then second pass absent/fails after ordinary read.

**Production effect:** Lite receives fallback snapshot without expected warning; price/read failure explanation is incomplete. Raw balances are not newly corrupted by this diagnostic loss.

**Mitigation/boundary:** Lite logs returned errors, so diagnostics omitted by SDK cannot be logged; read results may remain useful. Server SDK has no Pyth plugin, but browser/fresh SDK does.

**Reproduction:** Use local failing Pyth/enrichment response after a successful ordinary account/vault lens response; inspect fetched.errors. Existing SDK regression is synthetic; no browser fault injection performed.

**Lite evidence:** [composables/useEulerSdk.ts:323](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:323), [composables/useEulerAccount.ts:156](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:156), [composables/useFreshAccount.ts:73](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useFreshAccount.ts:73), [composables/useVaults.ts:385](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useVaults.ts:385).

## D14 — reachable-configuration-dependent

Enabled Pyth plugin can encounter unsupported reverse CrossAdapter route decoding.

**Trigger:** A queried reverse CrossAdapter route contains a needed Pyth leaf and no other prefetched route supplies it.

**Production effect:** Read enrichment/transaction preparation can omit needed update and return deficient prices or fail.

**Mitigation/boundary:** Reverse route is valid onchain, but no actual deployed inverse/Pyth configuration was established. Ordinary forward routes do not prove trigger.

**Reproduction:** Load a reverse CrossAdapter/Pyth fixture and request vault/account read or transaction simulation. Existing SDK route regression proves missing leaf only; not a deployed browser scenario.

**Lite evidence:** [composables/useEulerSdk.ts:323](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:323), [composables/useEulerTx.ts:459](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerTx.ts:459), [composables/useEulerAccount.ts:152](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:152).

## D15 — no-normal-ui-path

Lite fetches one chain at a time and does not call mixed-chain SDK population methods.

**Trigger:** Heterogeneous-chain array passed to EVaultService.populateCollaterals or EulerEarnService.populateStrategyVaults.

**Production effect:** No normal Lite cross-chain child-vault confusion demonstrated.

**Mitigation/boundary:** Browser fetches capture targetChainId; server vault snapshots/labels fetch by chain. Hydration calls each entity method with registry stub, not the faulty mixed-array service methods.

**Reproduction:** Custom SDK harness with chain 1 and 10 parents needed; switching the Lite chain alone is not this trigger.

**Lite evidence:** [composables/useVaults.ts:127](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useVaults.ts:127), [composables/useVaults.ts:379](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useVaults.ts:379), [composables/useVaults.ts:666](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useVaults.ts:666), [server/utils/vaults-cache.ts:251](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/utils/vaults-cache.ts:251), [server/utils/labels-view.ts:278](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/utils/labels-view.ts:278).
