# FeeFlow Service

`feeFlowService` is the SDK entry point for FeeFlow reads and buy-plan construction.

It is responsible for:

- fetching FeeFlow state for a chain
- filtering eligible vaults
- building a FeeFlow `buy()` transaction plan

Example:

- [`examples/execution/fee-flow-example.ts`](../../../examples/execution/fee-flow-example.ts)
