# Euler Lite reachability: swap, migration, rewards

Source: public Lite master `e1e39e7d6e8cb36d5ec84aa592965c5ad35fcfb1`; published SDK `3.3.0` (see `lite-sdk-package-validation.json`). Read-only Lite review; only local review artifacts added. Every S01–S10 finding is covered below. Reachability is not evidence of an incident on the hosted app.

Most actionable Lite paths: S09 repeated reward reads and S10 incorrect reward display, both contingent on upstream data. S04/S05 need bad deployment configuration; S07 needs particular enabled chains. S01 is an important narrowing: the faulty SDK code runs, but Lite overrides the affected borrowing estimate.

Offline checks: `node formal/integration/recheck/lite-swaps-rewards-probes.mjs` reproduced published SDK S01 arithmetic, S09 repeated offsets with a bounded stop, and S10 invented decimals. Details are in `lite-swaps-rewards-probes.json`. None signs or submits transactions, accesses live reward APIs, or drives a browser.

## S01 — Morpho virtual-share arithmetic

**Classification:** code-reached-impact-bypassed.

The wrong SDK conversion is called during ordinary inbound/outbound migration previews, but the demonstrated borrowing amount defect is bypassed by Lite.

**Trigger:** A Morpho market state where virtual offsets change conversion; SDK getPosition is called from the migration page.

**Lite production consequence / limitation:** Do not claim Lite overborrows from this SDK estimate: Lite explicitly supplies target.borrowAmount from its indexed source debt plus buffer (or quote input), and the SDK repays Morpho using exact shares. The faulty returned debt estimate is real, but no remaining Lite consumer giving the original production effect was found.

**Validation:** Offline published SDK reproduces debt 2 versus canonical 1; not a Lite browser/transaction reproduction.

**Evidence:**

- [lite pages/portfolio/migrate.vue:41](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/portfolio/migrate.vue:41)
- [lite pages/position/[number]/borrow/swap.vue:239](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/borrow/swap.vue:239)
- [lite pages/position/[number]/borrow/swap.vue:2736](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/borrow/swap.vue:2736)
- [lite composables/useEulerTx.ts:970](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerTx.ts:970)
- [sdk services/positionMigrationService/connectors/morpho/morphoConnector.js:328](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/positionMigrationService/connectors/morpho/morphoConnector.js:328)
- [sdk services/positionMigrationService/connectors/morpho/morphoConnector.js:403](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/positionMigrationService/connectors/morpho/morphoConnector.js:403)
- [sdk services/positionMigrationService/connectors/morpho/morphoConnector.js:933](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/positionMigrationService/connectors/morpho/morphoConnector.js:933)

## S02 — Aave zero stable-debt token

**Classification:** conditional-compatibility-not-demonstrated.

Aave migrations are exposed, but the necessary compatible Pool response is not established for current Aave.

**Trigger:** A configured Aave-compatible Pool returns zero for stableDebtTokenAddress on an account with debt.

**Lite production consequence / limitation:** Lite has its own discovery read with the same assumption, so discovery can fail before it ever reaches the SDK migration preview. Normal inspected Aave returns a compatibility mock, not zero. No ordinary existing deployment reproduction claimed.

**Validation:** No new runtime reproduction; pinned Pool interface/source distinction retained.

**Evidence:**

- [lite pages/portfolio/migrate.vue:18](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/portfolio/migrate.vue:18)
- [lite composables/useExternalMigrationPositions.ts:715](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useExternalMigrationPositions.ts:715)
- [lite composables/useExternalMigrationPositions.ts:749](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useExternalMigrationPositions.ts:749)
- [sdk services/positionMigrationService/connectors/aave/aaveConnector.js:212](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/positionMigrationService/connectors/aave/aaveConnector.js:212)

## S03 — Cached migration owner/chain mismatch

**Classification:** guarded-not-demonstrated.

The SDK accepts supplied positions, but Lite constructs them consistently and rejects stale preview context.

**Trigger:** Contradictory supplied cached position versus owner/chain/connector.

**Lite production consequence / limitation:** No normal UI route found to pass the demonstrated contradictory input: incoming candidates are filtered by owner/chain, positions are fetched with that context, preview keys include identity, and late results are rejected. Outgoing preview has equivalent identity and epoch guards.

**Validation:** Source tracing, not proof against every race or injected custom caller.

**Evidence:**

- [lite pages/position/[number]/borrow/swap.vue:195](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/borrow/swap.vue:195)
- [lite pages/position/[number]/borrow/swap.vue:2700](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/borrow/swap.vue:2700)
- [lite pages/position/[number]/borrow/swap.vue:2720](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/borrow/swap.vue:2720)
- [lite pages/position/[number]/borrow/swap.vue:2918](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/borrow/swap.vue:2918)
- [lite pages/position/[number]/migrate.vue:693](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/migrate.vue:693)
- [lite pages/position/[number]/migrate.vue:745](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/migrate.vue:745)
- [lite pages/position/[number]/migrate.vue:802](/private/tmp/euler-sdk-integration-review/euler-lite-master/pages/position/[number]/migrate.vue:802)
- [sdk services/positionMigrationService/positionMigrationService.js:415](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/positionMigrationService/positionMigrationService.js:415)

## S04 — Missing swapper allowlist

**Classification:** conditional-configuration.

Lite uses the affected quote-fetch method and adds no independent canonical target allowlist.

**Trigger:** Admitted deployment manifest has no nonzero canonical swappers, and an otherwise accepted noncanonical quote is supplied.

**Lite production consequence / limitation:** Affected swap quotes can reach planning through normal swap pages under that bad configuration. Manifest admission requires core/lens fields, not swap periphery fields. A correctly configured verifier still enforces final conditions; no live unsafe manifest or loss established.

**Validation:** Published JS branch verified; no new malformed quote execution.

**Evidence:**

- [lite composables/useSwapApi.ts:55](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useSwapApi.ts:55)
- [lite server/api/internal/euler-chains.get.ts:52](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/api/internal/euler-chains.get.ts:52)
- [lite features/reviewed-execution/domain/swap-quote.ts:98](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/domain/swap-quote.ts:98)
- [sdk services/swapService/swapService.js:241](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/swapService/swapService.js:241)

## S05 — Zero verifier accepted

**Classification:** conditional-configuration.

Lite uses the affected quote-fetch method and its address shape checks accept a zero address.

**Trigger:** Deployment manifest and matching quote both specify zero verifier, with other quote checks passing.

**Lite production consequence / limitation:** The malformed target can reach a normal swap plan; calling it does not perform verifier checks. No live zero-verifier deployment was established, and the overall effect depends on swap type and other contract checks.

**Validation:** Published JS and Lite schema source verified; no asset-transfer reproduction.

**Evidence:**

- [lite composables/useSwapApi.ts:55](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useSwapApi.ts:55)
- [lite server/api/internal/euler-chains.get.ts:56](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/api/internal/euler-chains.get.ts:56)
- [lite features/reviewed-execution/domain/schemas.ts:36](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/domain/schemas.ts:36)
- [lite features/reviewed-execution/domain/swap-quote.ts:107](/private/tmp/euler-sdk-integration-review/euler-lite-master/features/reviewed-execution/domain/swap-quote.ts:107)
- [sdk services/swapService/swapService.js:182](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/swapService/swapService.js:182)

## S06 — CoW late multi-item validation

**Classification:** not-normal-plan-shape.

Lite calls the CoW executor, but does not construct the demonstrated valid-cancellation then invalid-later-item vector.

**Trigger:** A mixed invalid multi-item CoW plan, with earlier side effects before the later validation.

**Lite production consequence / limitation:** Lite builds separate single-order flows and a separate cancellation plan. Merely using CoW does not reproduce this SDK issue. No ordinary UI sequence constructing its triggering vector was found; asynchronous wallet changes are a different question.

**Validation:** Source tracing of executor callers and generated single-item planners.

**Evidence:**

- [lite composables/cowswap/useCowSwapClosePositionExecution.ts:12](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/cowswap/useCowSwapClosePositionExecution.ts:12)
- [lite composables/cowswap/useCowSwapOpenPositionExecution.ts:13](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/cowswap/useCowSwapOpenPositionExecution.ts:13)
- [lite composables/cowswap/useCowSwapCollateralSwapExecution.ts:13](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/cowswap/useCowSwapCollateralSwapExecution.ts:13)
- [lite composables/cowswap/useCowSwapExecutionCore.ts:183](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/cowswap/useCowSwapExecutionCore.ts:183)
- [sdk services/executionService/cowExecutor.js:357](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/executionService/cowExecutor.js:357)

## S07 — Merkl distributor disagreement on chains 50/324

**Classification:** conditional-chain.

Lite directly uses SDK user rewards and claim planning without a Merkl distributor override.

**Trigger:** Enable XDC (50) or ZKsync Era (324), supply usable Euler deployment data, enable Merkl, obtain a proof-bearing direct reward row.

**Lite production consequence / limitation:** Reward can appear but claim planning rejects it with Merkl claim address mismatch. Both chain IDs exist in the installed AppKit network registry, but enabling them is controlled by deployment RPC environment and admitted manifest. No current hosted deployment enablement or claimable account was verified.

**Validation:** AppKit import confirms XDC 50 and ZKsync 324 are known networks; published SDK mismatch inspected.

**Evidence:**

- [lite composables/useEulerSdk.ts:184](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:184)
- [lite composables/useSdkRewards.ts:32](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useSdkRewards.ts:32)
- [lite utils/chain-env.ts:43](/private/tmp/euler-sdk-integration-review/euler-lite-master/utils/chain-env.ts:43)
- [lite entities/chainRegistry.ts:6](/private/tmp/euler-sdk-integration-review/euler-lite-master/entities/chainRegistry.ts:6)
- [sdk services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.js:973](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.js:973)
- [sdk services/rewardsService/rewardsService.js:149](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/rewardsService/rewardsService.js:149)
- [sdk services/rewardsService/rewardsService.js:540](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/rewardsService/rewardsService.js:540)

## S08 — Oversized intrinsic APY pagination

**Classification:** configuration-bypasses-trigger.

Lite leaves page and asset chunk sizes at the safe SDK defaults.

**Trigger:** SDK pageSize or maxAssetsPerRequest exceeds the upstream cap of 100.

**Lite production consequence / limitation:** No ordinary Lite configuration supplies those overrides: its custom intrinsic adapter sets endpoint only. Defaults are page 100 and filtered chunk 50, so the reviewed oversized-setting defect is not reproduced by Lite.

**Validation:** Published defaults and Lite initialization verified.

**Evidence:**

- [lite composables/useEulerSdk.ts:305](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:305)
- [lite server/utils/sdk-server.ts:105](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/utils/sdk-server.ts:105)
- [sdk services/intrinsicApyService/adapters/intrinsicApyV3Adapter/intrinsicApyV3Adapter.js:3](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/intrinsicApyService/adapters/intrinsicApyV3Adapter/intrinsicApyV3Adapter.js:3)
- [sdk services/intrinsicApyService/adapters/intrinsicApyV3Adapter/intrinsicApyV3Adapter.js:119](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/intrinsicApyService/adapters/intrinsicApyV3Adapter/intrinsicApyV3Adapter.js:119)

## S09 — Unpaginated reward APY loop

**Classification:** normal-path-data-dependent.

Ordinary Lite server vault snapshots reach the SDK chain-wide rewards fetch, which can repeat forever at 100 rows.

**Trigger:** V3 rewards mode/fallback active and /v3/apys/rewards for the requested scope returns at least 100 rows without pagination metadata.

**Lite production consequence / limitation:** Vault/reward snapshot loading can stall while repeated offset requests are issued. A server timeout or failure can stop an individual attempt; fallback cannot rescue a primary read that never finishes successfully or throws. It does not require one vault to have 100 campaigns: service population performs a chain-wide read.

**Validation:** Offline SDK 3.3.0 fetchChainRewards probe returned 100 rows repeatedly and observed offsets 0,100,200 before deliberately aborting. No live chain row count or browser incident established.

**Evidence:**

- [lite server/utils/sdk-server.ts:50](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/utils/sdk-server.ts:50)
- [lite server/utils/vaults-cache.ts:237](/private/tmp/euler-sdk-integration-review/euler-lite-master/server/utils/vaults-cache.ts:237)
- [sdk services/vaults/eVaultService/eVaultService.js:254](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/vaults/eVaultService/eVaultService.js:254)
- [sdk services/rewardsService/rewardsService.js:420](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/rewardsService/rewardsService.js:420)
- [sdk services/rewardsService/adapters/rewardsV3Adapter/rewardsV3Adapter.js:359](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/rewardsService/adapters/rewardsV3Adapter/rewardsV3Adapter.js:359)
- [lite composables/useEulerAccount.ts:147](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerAccount.ts:147)

## S10 — Fabricated reward decimals

**Classification:** normal-path-provider-data-dependent.

Lite trusts decimals returned by the SDK, so fabricated 18 defeats its otherwise-correct unknown-metadata handling.

**Trigger:** Enabled direct Brevis/Fuul provider returns reward data without decimals for a non-18-decimal token, including through fallback.

**Lite production consequence / limitation:** Portfolio reward amount and USD value display at the wrong scale; one 6-decimal token appears below 0.01 instead of one. Claim payload raw amounts are not changed. Lite would correctly show Amount unavailable if the SDK omitted unknown decimals.

**Validation:** Offline published Fuul adapter returns decimals18 for raw1000000 with omitted input precision; inspected Lite formatter and component consume that value. No live non-18 reward example or rendered browser reproduction.

**Evidence:**

- [lite composables/useEulerSdk.ts:204](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useEulerSdk.ts:204)
- [lite composables/useSdkRewards.ts:32](/private/tmp/euler-sdk-integration-review/euler-lite-master/composables/useSdkRewards.ts:32)
- [lite entities/reward-campaign.ts:40](/private/tmp/euler-sdk-integration-review/euler-lite-master/entities/reward-campaign.ts:40)
- [lite components/entities/portfolio/PortfolioSdkRewardItem.vue:60](/private/tmp/euler-sdk-integration-review/euler-lite-master/components/entities/portfolio/PortfolioSdkRewardItem.vue:60)
- [lite components/entities/portfolio/PortfolioSdkRewardItem.vue:317](/private/tmp/euler-sdk-integration-review/euler-lite-master/components/entities/portfolio/PortfolioSdkRewardItem.vue:317)
- [sdk services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.js:1031](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.js:1031)
- [sdk services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.js:1065](/private/tmp/euler-sdk-integration-review/sdk-published-3.3.0/package/dist/src/services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.js:1065)
