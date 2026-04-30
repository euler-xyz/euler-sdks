# Simulations & State Overrides

Euler SDK provides helpers for simulating transaction plans end-to-end. The simulation runs the exact EVC batch your plan would submit and returns decoded results plus enriched account/vault data so you can validate safety, filter bad quotes, and preview the resulting position before you send a transaction.

## Quick start

```typescript
// 1. Create a plan
const plan = sdk.executionService.planDeposit({ vault, amount, receiver, account, asset })

// 2. Simulate the full transaction plan.
// `stateOverrides` defaults to true (auto-inject balances/approvals).
const result = await sdk.executionService.simulateTransactionPlan(
  mainnet.id,
  accountAddress,
  plan,
  {
    stateOverrides: true, // optional; default is true
  },
)

if (result.simulationError) {
  console.error(result.simulationError.decoded)
} else {
  console.log("Simulation succeeded")
}
```

See [examples/simulations/simulate-deposit-example.ts](../examples/simulations/simulate-deposit-example.ts) for a full runnable example:

## Execution service simulation API

`executionService` is the recommended entry point for plan simulation.

### `simulateTransactionPlan(chainId, account, transactionPlan, options?)`

Simulates a full `TransactionPlan` and returns:

- `simulatedAccounts`: account entities updated to reflect the plan’s execution
- `simulatedVaults`: vault entities updated from lens data
- `canExecute`: `true` if all batch items succeeded, all status checks passed, and no insufficiencies were detected
- `simulationError`: decoded revert info when the simulation fails
- `rawBatchResults`: raw `batchSimulation` results for plan items only (lens calls excluded)
- `failedBatchItems`: decoded failed batch items with error details
- `accountStatusErrors` / `vaultStatusErrors`: health-check failures after execution
- requirements not met by the connected wallet (`insufficientWalletAssets`, `insufficientDirectAllowances`, `insufficientPermit2Allowances`)

Why use it:
- Filter failing swap quotes or routes before submitting a transaction.
- Ensure the resulting position is healthy (health factor, LTV) and passes vault status checks.
- Catch vault caps or other protocol limits that would cause a revert.
- Evaluate position profitability without holding tokens, since the simulation can inject balances/approvals.

### `estimateGasForTransactionPlan(chainId, account, transactionPlan, options?)`

Estimates gas for the executable items in a `TransactionPlan`. Like simulation, `stateOverrides` defaults to `true`, so required wallet balances and allowances are injected while `requiredApproval` items are skipped. EVC batches are estimated through `EVC.batch`, direct `contractCall` items are estimated against their target contracts, and viem gas-estimation errors are thrown to the caller.

```typescript
const gas = await sdk.executionService.estimateGasForTransactionPlan(
  chainId,
  accountAddress,
  plan,
)
```

### Population of simulated accounts

`simulateTransactionPlan` can populate the returned account/vault entities using the same fetch options as `accountService.fetchAccount`. This is useful when you want computed properties (e.g., ROE, APY breakdowns, USD values) on the simulated account:

```typescript
const result = await sdk.executionService.simulateTransactionPlan(
  chainId,
  accountAddress,
  plan,
  {
    accountFetchOptions: {
      populateVaults: true,
      populateMarketPrices: true,
      populateUserRewards: true,
      vaultFetchOptions: {
        populateMarketPrices: true,
        populateRewards: true,
        populateIntrinsicApy: true,
      },
    },
  }
)
```


## State override utilities

All exports are available from the top-level `@eulerxyz/euler-v2-sdk` package.

### `deriveStateOverrides(chainId, account, transactionPlan, options?)`

Generates the override set for a plan. Internally it uses `eth_createAccessList` (EIP-2930) to discover storage slots for balances and approvals.

This is exposed on `executionService` and uses its configured provider and deployment service.

```typescript
const stateOverride = await sdk.executionService.deriveStateOverrides(chainId, accountAddress, plan, {
  nativeBalance: parseEther("1000"), // optional, defaults to 1000 ETH
})
```

## EVC `batchSimulation`

The EVC (Ethereum Vault Connector) exposes a `batchSimulation` function that executes a batch of calls and returns the results without committing state changes. This is the recommended way to simulate Euler transactions.

### How it works

`batchSimulation` accepts the same `BatchItem[]` as the regular `batch` function:

```solidity
struct BatchItem {
    address targetContract;
    address onBehalfOfAccount;
    uint256 value;
    bytes data;
}
```

Internally, it:
1. Calls `batchRevert(items)` which executes all batch items and then **always reverts** with the encoded results
2. Catches the revert data and decodes it
3. Returns the results as normal return values

This means `batchSimulation` itself does **not** revert — it always returns successfully with the results of each item.

### Return values

```solidity
function batchSimulation(BatchItem[] calldata items) external payable returns (
    BatchItemResult[] memory batchItemsResult,
    StatusCheckResult[] memory accountsStatusCheckResult,
    StatusCheckResult[] memory vaultsStatusCheckResult
);
```

- **`batchItemsResult`** — one entry per batch item: `{ success: bool, result: bytes }`. The `result` contains the return data (on success) or error data (on failure).
- **`accountsStatusCheckResult`** — account status checks performed by the EVC after the batch: `{ checkedAddress, isValid, result }`.
- **`vaultsStatusCheckResult`** — vault status checks: `{ checkedAddress, isValid, result }`.

### Using with state overrides

When called via `eth_call` (which `simulateContract` uses under the hood), you can pass `stateOverride` to inject balances and approvals:

```typescript
const { result } = await client.simulateContract({
  address: evcAddress,
  abi: ethereumVaultConnectorAbi,
  functionName: "batchSimulation",
  args: [batchItems],
  account: accountAddress,   // msg.sender for the simulation
  stateOverride,             // injected balances + approvals
})

const [batchResults, accountChecks, vaultChecks] = result
```

### Appending read calls to the batch

Since `batchSimulation` returns the raw result bytes for each item, you can append view calls to the batch to read state after the simulated operations:

```typescript
import { erc20Abi, encodeFunctionData, decodeFunctionResult } from "viem"

// Append balanceOf to check vault shares after a deposit
batchItems.push({
  targetContract: vaultAddress,
  onBehalfOfAccount: subAccountAddress,
  value: 0n,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [subAccountAddress],
  }),
})

// After simulation, decode the last result
const balanceResult = batchResults[batchResults.length - 1]
if (balanceResult.success) {
  const shares = decodeFunctionResult({
    abi: erc20Abi,
    functionName: "balanceOf",
    data: balanceResult.result,
  })
}
```

This pattern lets you simulate a transaction and read back any resulting state in a single `eth_simulateContract`.

### Skipping approvals in simulation

When using state overrides, the `RequiredApproval` items in a `TransactionPlan` can be skipped — the overrides inject the necessary allowances directly into storage. Only the `evcBatch` items need to be passed to `batchSimulation`:
