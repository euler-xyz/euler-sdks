# FeeFlow Service

`feeFlowService` is the SDK entry point for FeeFlow reads and buy-plan construction.

It is responsible for:

- fetching FeeFlow state for a chain
- filtering eligible vaults
- reading current selected-vault inventory from the controller and vaults
- building a FeeFlow `buy()` transaction plan

`buildBuyPlan` revalidates each selected vault onchain. Every vault must still
name the FeeFlow controller as its protocol fee receiver and must have either
controller-held shares or claimable protocol fees. Pass the displayed
`slot0.epochId` as `expectedEpochId` to reject a selection when the auction
epoch changes before planning. The controller's epoch check still protects the
plan if another buy lands after planning.

Example:

- [`examples/execution/fee-flow-example.ts`](../examples/execution/fee-flow-example.ts)
