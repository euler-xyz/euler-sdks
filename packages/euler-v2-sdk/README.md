# Euler V2 SDK

## Installation

```bash
pnpm install euler-v2-sdk
```

## Example Usage (Multiply + Simulation)

```typescript
import { buildEulerSDK, getSubAccountAddress } from "euler-v2-sdk";
import { mainnet } from "viem/chains";
import { parseUnits } from "viem";

const sdk = await buildEulerSDK({
  rpcUrls: {
    [mainnet.id]: "https://your-rpc-url",
  },
});

const owner = "0xYourEOA";
const subAccount = getSubAccountAddress(owner, 1);

const account = await sdk.accountService.fetchAccount(mainnet.id, owner, {
  populateVaults: false,
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
```

## What This SDK Is For

`euler-v2-sdk` provides everything needed to interact with Euler V2 lending contracts:

- fetching account, vault, wallet, and market data
- planning and composing EVC transaction batches
- resolving approvals (approve/Permit2 paths)
- simulating transactions before execution
- handling swaps, pricing, rewards, labels, and deployed addresses
- fetching oracle adapter metadata/checks (provider, methodology, checks)

The SDK is built with dependency injection, so you can use `buildEulerSDK()` for a default setup, run individual services in isolation, or provide custom service implementations.

## Docs Table of Contents

All docs are in [`./docs`](./docs).

1. [Basic Usage](./docs/basic-usage.md) - Fast setup and common account/vault usage patterns.
2. [SDK Architecture Overview](./docs/sdk-architecture-overview.md) - High-level architecture, dependency injection model, and composition options.
3. [Services](./docs/services.md) - Service map, top-level entry points, and lower-level support services.
4. [Execution Service](./docs/execution-service.md) - `encodeX` vs `planX`, approvals flow, `mergePlans`, and `describeBatch`.
5. [Simulations and State Overrides](./docs/simulations-and-state-overrides.md) - Plan simulation flow, validation output, and state override utilities.
6. [Swaps](./docs/swaps.md) - Swap quote APIs and how swap payloads fit into plans.
7. [Pricing System](./docs/pricing-system.md) - Price data pipeline, fallback behavior, and pricing integration points.
8. [Data Architecture](./docs/data-architecture.md) - Entities/adapters/services layering, population model, and data flow.
9. [Cross-Service Data Population](./docs/cross-service-data-population.md) - How services enrich entities with prices, rewards, labels, and nested vaults.
10. [Account Computed Properties](./docs/account-computed-properties.md) - Health factor/LTV/net-value computed fields and data prerequisites.
11. [Caching External Data Queries](./docs/caching-external-data-queries.md) - `query*` decoration pattern for caching/logging/profiling.
12. [Plugins](./docs/plugins.md) - Plugin system for read-path and plan-path extensions.
13. [Labels](./docs/labels.md) - Label metadata model and usage.
14. [Decoding Smart Contract Errors](./docs/decode-smart-contract-errors.md) - Revert decoding utilities for better error handling.
15. [Entity Diagnostics](./docs/entity-diagnostics.md) - Sidecar metadata for data normalization, fallbacks, and per-field warnings.

## Examples

Runnable examples are in [`./examples`](./examples), including end-to-end execution flows and simulations against a fork.
