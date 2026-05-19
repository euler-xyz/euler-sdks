# Changelog

All notable changes to the `euler-sdk` skill are documented in this file.

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
