# SDK Architecture Overview

This SDK is organized as composable layers:

1. **Entities**: domain objects (`Account`, `EVault`, `EulerEarn`, `Wallet`, etc.)
2. **Data services**: services/adapters that fetch and assemble entity data
3. **Execution and simulation services**: transaction planning and pre-trade/pre-tx validation
4. **Infrastructure services**: deployed contract addresses, providers, ABIs, labels, token metadata, pricing, rewards

The overall pattern is **dependency injection**: services are constructed from interfaces/adapters, then wired together.

## High-Level Composition

At runtime, the SDK is built from service instances that collaborate:

- `accountService` fetches account/sub-account state and can populate vault entities
- `vaultMetaService` routes vault addresses to the correct vault-type service
- `executionService` builds transaction plans for deposits/borrows/repays/swaps/liquidations, simulates plans, estimates gas, and executes plans
- `deploymentService` provides chain-specific deployed contract addresses
- `providerService` provides chain RPC clients
- `abiService` provides contract ABIs for encoding/decoding

See [Services](./services.md) for the complete service list.

## Entities and Data Creation

The SDK returns rich entities (not only raw RPC/subgraph payloads). Data flows through adapters into services, then into entity constructors.

- Entities and layering details: [Data Architecture](./data-architecture.md)
- Cross-entity/service enrichment: [Cross-Service Data Population](./cross-service-data-population.md)
- Basic usage patterns: [Basic Usage](./basic-usage.md)

## Execution and Simulation

- `executionService` builds EVC batch-based plans for protocol actions, executes them through wallet clients, and can run those plans in simulation mode to report:
  - simulated account/vault state
  - failed batch items
  - account/vault status-check failures
  - decoded simulation errors

Details and options: [Simulations and State Overrides](./simulations-and-state-overrides.md).

## Dependency Injection Pattern

`buildEulerSDK()` is the default composition root. It creates the standard services and wires dependencies.

```typescript
import { buildEulerSDK } from "@eulerxyz/euler-v2-sdk";

const sdk = await buildEulerSDK({
  rpcUrls: { 1: "https://your-rpc-url" },
});
```

You can also:

- use services in isolation (instantiate only what your app needs)
- provide custom service implementations via `servicesOverrides`
- register additional/custom vault services for custom vault types

This is possible because service interfaces are injected and composed rather than hard-coded.

Related docs:

- [Plugins](./plugins.md)
- [Pricing System](./pricing-system.md)
- [Swaps](./swaps.md)
- [Caching External Data Queries](./caching-external-data-queries.md)

## Where to Continue

- Runnable examples: `examples/`
- Documentation: `docs/`
- Utilities: `src/utils`
