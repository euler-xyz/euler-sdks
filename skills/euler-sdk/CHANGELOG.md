# Changelog

All notable changes to the `euler-sdk` skill are documented in this file.

## 1.5.0 - 2026-09-01
- Documented the native Data V3 oracle adapter assessment and indexed router APIs.
- Added recognition-versus-health and oracle assessment query-caching guidance.
- Updated normalized address-map guidance to `fetchOracleAdapterAssessmentMap`.
- Documented the oracle service's direct return shape.

## 1.4.0 - 2026-08-11
- Added `safeAccountService` coverage: on-chain Safe smart-account detection (`fetchSafeAccount` → singleton/version/threshold/owners), the masterCopy-probe detection model, owner-invariant validation, contract-vs-transport failure semantics, and the heuristic-only (never authorization) guidance.
- Documented the return-shape exception in the diagnostics-envelope guidance: `safeAccountService.fetchSafeAccount()` returns `SafeAccountInfo | null` directly, not `{ result, errors }`.
- New reference doc: `packages/euler-v2-sdk/docs/safe-account-service.md`; service entries added to `SKILL.md`, `AGENTS.md`, and `rules/sdk-architecture.md`.

## 1.3.0 - 2026-07-08
- Added `sdk-migrations` rule covering `positionMigrationService`: cross-protocol position migration (Aave V3, Morpho Blue, MetaMorpho) into/out of Euler, connector/direction selection, authorization signing, collateral/debt swaps, and `planMigrationSimulation`.
- Expanded `AGENTS.md` section 4 (Integration Patterns) with `4.2 Cross-Protocol Position Migration`.
- Added `portfolioService` (position-first savings/borrows views) and `priceService` (display-only market prices vs oracle risk prices) coverage to `sdk-ui-data-layer` and the entry-point lists.
- New reference doc: `packages/euler-v2-sdk/docs/position-migration-service.md`.

## 1.2.0 - 2026-05-19
- Added `sdk-fallback-adapter` rule covering V3 → onchain/subgraph/direct fallback chains, default trigger semantics, `onFallback` telemetry (`FallbackInfo.trigger`, `missingIndices`), and custom `createFallbackAdapter` composition.
- Expanded `AGENTS.md` section 3 (Runtime Performance) with `3.3 Fallback Adapter for V3 / Onchain Routing`.
- New reference doc: `packages/euler-v2-sdk/docs/fallback-system.md`.

## 1.1.2 - 2026-05-07
- Added `walletService` guidance for native/ERC20 balances and direct/Permit2 allowance state.
- Added wallet query caching guidance and wallet example references.

## 1.1.1 - 2026-04-16
- Aligned examples with diagnostics-aware service returns (`{ result, errors }`).
- Updated approval resolution guidance to the current `plan`/`account` API shape.
- Clarified custom `buildQuery` behavior and full-debt swap mode usage.

## 1.1.0 - 2026-03-09
- Added explicit skill versioning policy (`VERSIONING.md`).
- Added guidance for npm-package discovery via packaged `AGENTS.md` and `skills/` paths.

## 1.0.0 - 2026-03-02
- Initial release of the Euler SDK skill.
