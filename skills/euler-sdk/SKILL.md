---
name: euler-sdk
description: Euler V2 SDK integration guide for building production UIs, bots, scripts, and tooling. This skill should be used when implementing apps on top of the `euler-v2-sdk` package, including account/vault/wallet reads, transaction planning, approval handling, simulation, swaps, rEUL locks, plugins, and query caching. Triggers on tasks involving `buildEulerSDK`, SDK services (`accountService`, `vaultMetaService`, `walletService`, `executionService`, `swapService`, `reulLockService`), React Query integration, or SDK examples in `packages/euler-v2-sdk/examples/`.
license: MIT
metadata:
  author: Euler Labs
  version: "1.5.0"
---

# Euler SDK Agent Skill

Euler V2 SDK integration guide for building reliable frontends, scripts, and automation on top of `euler-v2-sdk`.

## When to Apply

Reference these guidelines when:
- Building UI data layers on top of SDK services and entities
- Planning and executing user transactions (deposit, borrow, repay, swap, liquidation)
- Simulating plans and showing pre-trade safety checks
- Integrating plugins (Pyth, Keyring) for read/write readiness
- Optimizing performance with `buildQuery` caching and stale-time design
- Writing scripts and automation from SDK examples

## Rule Categories

| Rule | Impact | Description |
|------|--------|-------------|
| `sdk-architecture` | HIGH | Build SDK once and use top-level services with correct fetch options |
| `sdk-ui-data-layer` | HIGH | Build reactive UI query layer with type-aware vault routing and population |
| `sdk-execution-flow` | CRITICAL | Plan transactions, resolve approvals, and execute EVC batch safely |
| `sdk-simulation-safety` | CRITICAL | Simulate plans before sending and gate execution on checks |
| `sdk-caching-buildquery` | HIGH | Wrap all `query*` calls via `buildQuery` with per-query stale times |
| `sdk-plugins` | HIGH | Use plugins for oracle/keyring preconditions on read and write paths |
| `sdk-fallback-adapter` | HIGH | Configure V3 → onchain/subgraph/direct fallback chains and observe `onFallback` telemetry |
| `sdk-swaps` | HIGH | Quote, select, and execute swap-driven operations safely |
| `sdk-migrations` | MEDIUM | Migrate positions across protocols with the right connector, direction, and authorization |
| `sdk-scripts` | MEDIUM | Use SDK examples as templates for scripts, bots, and CI checks |

## Quick Reference

### Core SDK Entry Points

- `buildEulerSDK({...})` as composition root
- `buildEulerSDK({ config: {...} })` for SDK-owned runtime config; `config` overrides explicit options, `EULER_SDK_*` env vars, and defaults
- `accountService` for account/sub-account positions
- `portfolioService` for a position-first savings/borrows view over a fully populated account (`fetchPortfolio`, `buildPortfolio`)
- `vaultMetaService` when vault type is unknown or mixed
- `walletService` for native/ERC20 wallet balances and direct/Permit2 allowance state
- `executionService` for `planX`/`encodeX` and approvals
- `executionService` for plugin-aware plan simulation, gas estimation, execution, and pre-execution validation; CoW plans execute through `executeCowSwapTransactionPlan`, expose order status/cancellation helpers, and are not simulation/gas-estimation inputs
- `swapService` for provider quotes and route payloads, including `cowSwap` metadata for CoW-supported position flows
- `positionMigrationService` for cross-protocol position migration (Aave V3, Morpho Blue, MetaMorpho) into/out of Euler, with connector-specific authorizations
- `rewardsService` for reward reads and provider-specific claim plans; the default V3 path normalizes Incentra rows as Brevis and returns direct proof-backed Brevis rows when V3 lacks claim metadata
- `reulLockService` for rEUL vesting lock reads and unlock transaction plans
- `safeAccountService` for Safe smart-account detection and signer configuration (threshold/owners) reads
- `eulerLabelsService` plus exported `utils/eulerLabels` helpers for normalized labels metadata, notices, restrictions, and product/vault flags
- `oracleAdapterService` returns Data V3 recognition and health assessments plus indexed router state; use `fetchOracleAdapterAssessmentMap(chainId)` for normalized address lookups
- `priceService` for display-only USD market prices (V3 → on-chain oracle fallback); prefer the `populateMarketPrices` fetch option and use oracle risk prices for risk math

Most service `fetch*` methods return diagnostics envelopes (`{ result, errors }`). Destructure `result` in examples and map `errors[].locations[]` by owner reference for UI diagnostics. `oracleAdapterService` returns assessments and routers directly, while `safeAccountService.fetchSafeAccount()` returns `SafeAccountInfo | null` directly.

Built-in scalar config resolves as `config` prop, explicit SDK option, `EULER_SDK_*` env var, then default. RPC URLs can come from `config.rpcUrls` or `EULER_SDK_RPC_URL_<chainId>`. Reference `packages/euler-v2-sdk/docs/config-through-env.md` for the env/config field list.

### Preferred UI Pattern

1. Initialize one SDK instance in app context/provider.
2. Decorate all SDK `query*` methods with `buildQuery` (React Query or equivalent cache).
3. Use service-level `fetch*` methods in hooks for reactive UI.
4. Set population flags explicitly (`populateMarketPrices`, `populateRewards`, etc.).
5. Simulate `TransactionPlan` before execution when user risk is non-trivial.

CoW swap plans are an exception to the simulation step: build them from CoW quotes with the CoW-specific planners and execute them through `executeCowSwapTransactionPlan`, then track returned `orderUids` with `fetchCowSwapOrderStatus` or `pollCowSwapOrderStatus`. Use `cancelCowSwapOrder` for open-position/collateral-swap CoW orders and `planCancelClosePositionWithCow` for close-position CoW orders that cancel by invalidating the EVC permit nonce.

## Companion Skills

- `euler-vaults` - protocol-level mechanics, EVC and risk
- `euler-data` - Lens/subgraph/interfaces references
- `euler-advanced` - hooks, flash loans, debt transfer
- `euler-irm-oracles` - oracle adapters and IRM specifics
- `euler-earn` - EulerEarn vault strategy management

## How to Use

Read individual rule files for details and implementation patterns:

```
rules/sdk-architecture.md
rules/sdk-ui-data-layer.md
rules/sdk-execution-flow.md
rules/sdk-simulation-safety.md
rules/sdk-caching-buildquery.md
rules/sdk-plugins.md
rules/sdk-fallback-adapter.md
rules/sdk-swaps.md
rules/sdk-migrations.md
rules/sdk-scripts.md
```

## Full Compiled Document

For a longer consolidated guide with all sections: `AGENTS.md`
