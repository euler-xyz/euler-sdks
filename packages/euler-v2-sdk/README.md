# Euler V2 SDK

## Installation

```bash
npm install @eulerxyz/euler-v2-sdk
```

## Example Usage (Multiply + Simulation)

```typescript
import { buildEulerSDK, getSubAccountAddress } from "@eulerxyz/euler-v2-sdk";
import { mainnet } from "viem/chains";
import { parseUnits } from "viem";

// Set EULER_SDK_RPC_URL_1=https://your-rpc-url in the environment.
const sdk = await buildEulerSDK();

const owner = "0xYourEOA";
const subAccount = getSubAccountAddress(owner, 1);

const account = await sdk.accountService.fetchAccount(mainnet.id, owner, {
  populateVaults: true,
});

const quotes = await sdk.swapService.getDepositQuote({
  chainId: mainnet.id,
  fromVault: "0xLiabilityVault",
  toVault: "0xLongVault",
  fromAccount: subAccount,
  toAccount: subAccount,
  fromAsset: "0xLiabilityAsset",
  toAsset: "0xLongAsset",
  amount: parseUnits("50", 6),
  origin: owner,
  slippage: 0.5,
  deadline: Math.floor(Date.now() / 1000) + 1800,
});

const plan = sdk.executionService.planMultiplyWithSwap({
  account,
  collateralVault: "0xCollateralVault",
  collateralAmount: parseUnits("100", 6),
  collateralAsset: "0xCollateralAsset",
  swapQuote: quotes[0]!,
});

const simulation = await sdk.simulationService.simulateTransactionPlan(
  mainnet.id,
  owner,
  plan,
  { stateOverrides: true }
);

// Use simulated account and vaults state in the UI.
// Use simulation.canExecute or errors to decide whether and how to execute this plan in your app.
// See /examples/utils/executor.ts
```

## What This SDK Is For

`@eulerxyz/euler-v2-sdk` provides everything needed to interact with Euler V2 lending contracts:

- fetching account, vault, wallet balance/allowance, and market data
- planning and composing EVC transaction batches
- resolving approvals (approve/Permit2 paths)
- simulating transactions before execution
- handling vault swaps, wallet-to-wallet swaps, pricing, rewards, rEUL locks, normalized euler-labels metadata, and deployed addresses
- fetching oracle adapter metadata/checks keyed by oracle adapter address (provider, methodology, checks)

The SDK is built with dependency injection, so you can use `buildEulerSDK()` for a default setup, run individual services in isolation, or modify the behavior with your custom implementations.

## Configuration

Runtime config can come from `buildEulerSDK({ config })`, supported explicit SDK options, `EULER_SDK_*` environment variables, or SDK defaults. RPC URLs are supplied through `config.rpcUrls` or `EULER_SDK_RPC_URL_<chainId>`. See the full [Configuration Reference](./docs/configuration.md) and [Config Through Env](./docs/config-through-env.md) for all options and defaults.

## Docs Table of Contents

All docs are in [`./docs`](./docs).

1. [Configuration](./docs/configuration.md) - All `buildEulerSDK()` options, defaults, and service overrides.
2. [Config Through Env](./docs/config-through-env.md) - `EULER_SDK_*` environment variables and matching `config` fields.
3. [Basic Usage](./docs/basic-usage.md) - Fast setup and common account/vault/wallet usage patterns.
4. [SDK Architecture Overview](./docs/sdk-architecture-overview.md) - High-level architecture, dependency injection model, and composition options.
5. [Services](./docs/services.md) - Service map, top-level entry points, and lower-level support services.
6. [Wallet Service](./docs/wallet-service.md) - Native/ERC20 balances and direct/Permit2 allowance reads.
7. [Execution Service](./docs/execution-service.md) - `encodeX` vs `planX`, approvals flow, named operation groups, `mergePlans`, and `describeBatch`.
8. [Simulations and State Overrides](./docs/simulations-and-state-overrides.md) - Plan simulation flow, validation output, and state override utilities.
9. [Swaps](./docs/swaps.md) - Swap quote APIs and how swap payloads fit into plans.
10. [CoW Swaps](./docs/cow-swaps.md) - CoW quote metadata, CoW-specific planners, order submission, status polling, and cancellation.
11. [rEUL Lock Service](./docs/reul-lock-service.md) - rEUL lock reads and unlock transaction planning.
12. [Pricing System](./docs/pricing-system.md) - Price data pipeline, fallback behavior, and pricing integration points.
13. [Data Architecture](./docs/data-architecture.md) - Entities/adapters/services layering, population model, and data flow.
14. [Cross-Service Data Population](./docs/cross-service-data-population.md) - How services enrich entities with prices, rewards, labels, and nested vaults.
15. [Portfolio](./docs/portfolio.md) - High-level savings/borrows abstraction built from populated accounts.
16. [Entity Reference](./docs/entities/index.md) - Property-level reference for exported entity shapes.
17. [Account Computed Properties](./docs/account-computed-properties.md) - Health factor/LTV/net-value computed fields and data prerequisites.
18. [Caching External Data Queries](./docs/caching-external-data-queries.md) - `query*` decoration pattern for caching/logging/profiling.
19. [Plugins](./docs/plugins.md) - Plugin system for read-path and plan-path extensions.
20. [Labels](./docs/labels.md) - Label metadata model and usage.
21. [Decoding Smart Contract Errors](./docs/decode-smart-contract-errors.md) - Revert decoding utilities for better error handling.
22. [Entity Diagnostics](./docs/entity-diagnostics.md) - Sidecar metadata for data normalization, fallbacks, and per-field warnings.

## Examples

Runnable examples are in [`./examples`](./examples), including end-to-end execution flows and simulations against a fork.

Comparison, parity-check, and other test-oriented scripts and reports live under [`./test/parity`](./test/parity).

## Release Process

This package is published through the repo-local [`RELEASE.md`](./RELEASE.md) playbook and the local `$publish` skill.

Git tags and GitHub Releases are the release-note source of truth. The committed [`package.json`](./package.json) does not carry a release version; `$publish` derives the npm version from the `euler-v2-sdk-vX.Y.Z` tag, including prerelease tags such as `euler-v2-sdk-vX.Y.Z-beta.0`.

The publish flow verifies npm auth, runs `pnpm -C packages/euler-v2-sdk run release:check`, creates and pushes an `euler-v2-sdk-vX.Y.Z` tag from the selected `main` commit, temporarily writes the tag version for npm, dry-runs the package, publishes with `npm publish --access public --provenance=false`, restores the working tree, and creates the GitHub Release against the verified tag from a generated notes file. Prereleases publish with the matching npm dist-tag, for example `npm publish --access public --tag beta --provenance=false`.

Publishing uses the operator's local npm session. npm may prompt for a one-time password or provide a browser authentication URL; complete that prompt before the publish process exits.
