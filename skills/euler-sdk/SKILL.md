---
name: euler-sdk
description: Euler V2 SDK integration guide for building production UIs, bots, scripts, and tooling. This skill should be used when implementing apps on top of the `euler-v2-sdk` package, including account/vault/wallet reads, transaction planning, approval handling, simulation, swaps, plugins, and query caching. Triggers on tasks involving `buildEulerSDK`, SDK services (`accountService`, `vaultMetaService`, `walletService`, `executionService`, `swapService`), React Query integration, or SDK examples in `packages/euler-v2-sdk/examples/`.
license: MIT
metadata:
  author: Euler Labs
  version: "1.1.2"
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
| `sdk-swaps` | HIGH | Quote, select, and execute swap-driven operations safely |
| `sdk-scripts` | MEDIUM | Use SDK examples as templates for scripts, bots, and CI checks |

## Quick Reference

### Core SDK Entry Points

- `buildEulerSDK({...})` as composition root
- `buildEulerSDK({ config: {...} })` for SDK-owned runtime config; `config` overrides explicit options, `EULER_SDK_*` env vars, and defaults
- `accountService` for account/sub-account positions
- `vaultMetaService` when vault type is unknown or mixed
- `walletService` for native/ERC20 wallet balances and direct/Permit2 allowance state
- `executionService` for `planX`/`encodeX` and approvals
- `executionService` for plugin-aware plan simulation, gas estimation, execution, and pre-execution validation
- `swapService` for provider quotes and route payloads
- `rewardsService` for reward reads and provider-specific claim plans
- `eulerLabelsService` plus exported `utils/eulerLabels` helpers for normalized labels metadata, notices, restrictions, and product/vault flags
- `oracleAdapterService.fetchOracleAdapterMap(chainId)` returns metadata keyed by normalized `adapter.oracle` address
- EVault entities expose decoded oracle routes: `debtPricingOracleAdapters` for the debt asset path and `collaterals[].oracleAdapters` for collateral paths; use `buildOracleAdapterQuoteRequests` to derive ordered adapter quote descriptors when the app owns execution.

Service `fetch*` methods return diagnostics envelopes (`{ result, errors }`). Destructure `result` in examples and map `errors[].locations[]` by owner reference for UI diagnostics.

Built-in scalar config resolves as `config` prop, explicit SDK option, `EULER_SDK_*` env var, then default. RPC URLs can come from `config.rpcUrls` or `EULER_SDK_RPC_URL_<chainId>`. Reference `packages/euler-v2-sdk/docs/config-through-env.md` for the env/config field list.

### Preferred UI Pattern

1. Initialize one SDK instance in app context/provider.
2. Decorate all SDK `query*` methods with `buildQuery` (React Query or equivalent cache).
3. Use service-level `fetch*` methods in hooks for reactive UI.
4. Set population flags explicitly (`populateMarketPrices`, `populateRewards`, etc.).
5. Simulate `TransactionPlan` before execution when user risk is non-trivial.

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
rules/sdk-swaps.md
rules/sdk-scripts.md
```

## Full Compiled Document

For a longer consolidated guide with all sections: `AGENTS.md`
