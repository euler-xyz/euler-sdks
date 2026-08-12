# FeeFlow Service

`feeFlowService` is the SDK entry point for FeeFlow reads. Buy-plan construction
is currently disabled.

It is responsible for:

- fetching FeeFlow state for a chain
- filtering eligible vaults
- reading current selected-vault inventory from the controller and vaults
- rejecting FeeFlow `buy()` plan construction until the deployed path can
  enforce a nonzero or minimum selected-vault payout atomically

Inventory reads remain available: controller-held shares count as inventory
even if the vault later changes its protocol fee receiver, while unconverted
protocol fees count only while the vault still names the controller as receiver.

`buildBuyPlan` always throws `FEE_FLOW_BUY_UNAVAILABLE_ERROR`. The current util
can collect payment after a concurrent same-epoch buy drains the selected vaults,
without atomically enforcing any selected-vault output. Client-side inventory
checks and post-transaction balance checks cannot make that path safe.

Example:

- [`examples/execution/fee-flow-example.ts`](../examples/execution/fee-flow-example.ts)
  demonstrates the supported read-only discovery flow and reports why execution
  is unavailable.
