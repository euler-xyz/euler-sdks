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

See [examples/simulations/simulate-deposit-example.ts](../examples/simulations/simulate-deposit-example.ts) for a full runnable example. For the performance-tuned fan-out pattern (slot-hint prime + wallet snapshot + plugin prefetch), see [examples/simulations/simulate-with-prefetch-and-slot-hints-example.ts](../examples/simulations/simulate-with-prefetch-and-slot-hints-example.ts).

## Execution service simulation API

`executionService` is the recommended entry point for plan simulation.

### `simulateTransactionPlan(chainId, account, transactionPlan, options?)`

Simulates a full `TransactionPlan` after applying configured write-path plugins. The `account` argument is `AddressOrAccount` (`Address | Account`): pass an owner address when the SDK should fetch whatever plugin data it needs, or pass an already-fetched `Account` when you want plugins to reuse account state.

Returns:

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

Estimates gas for the executable items in a `TransactionPlan` after applying the same plugin pipeline used by simulation and execution. Like simulation, `stateOverrides` defaults to `true`, so required wallet balances and allowances are injected while `requiredApproval` items are skipped. EVC batches are estimated through `EVC.batch`, direct `contractCall` items are estimated against their target contracts, and viem gas-estimation errors are thrown to the caller.

```typescript
const gas = await sdk.executionService.estimateGasForTransactionPlan(
  chainId,
  accountAddress,
  plan,
)
```

## Performance tuning: `SimulationStateOverrideOptions`

`simulateTransactionPlan`, `estimateGasForTransactionPlan`, and the prepared-envelope variants accept a `stateOverrideOptions: SimulationStateOverrideOptions` field. The same shape is also taken by the lower-level `deriveStateOverrides` / `prepareTransactionPlan` (via `stateOverrides.options`). Use it when you want to amortise simulation cost across many calls — typical for swap-quote fan-outs, leverage calculators, or any UI that simulates dozens of candidate plans for a single user interaction.

```typescript
const overrides = {
  // The UI already validated "Not enough balance". The simulator doesn't need
  // to forge balances at all — skip balanceOf reads + slot probing.
  noBalanceOverride: true,
  // The sender has already approved Permit2 / direct allowances. Skip the
  // allowance branch entirely.
  noAllowanceOverride: false,
  // The wallet snapshot the UI already holds. When a value here is ≥ the
  // plan's requirement, the SDK emits no override and skips the per-call RPC.
  wallet: {
    balances: { [getAddress(token)]: 1_000n * 10n ** 6n },
    allowances: { [`${getAddress(token)}:${getAddress(spender)}`]: maxUint256 },
  },
  // Pre-fetched ERC20 storage-slot hints. Lets the SDK bypass eth_createAccessList
  // discovery and compute the slot cryptographically.
  slotHints,
}

const gas = await sdk.executionService.estimateGasForTransactionPlan(
  chainId,
  accountAddress,
  plan,
  { stateOverrides: true, stateOverrideOptions: overrides },
)
```

| Field | When to set | What it skips |
|---|---|---|
| `noBalanceOverride: true` | UI validates wallet balance up front (or operation doesn't consume wallet ERC20 at all — e.g. collateral-swap repay, debt swap). | Every `balanceOf` RPC + balance-slot discovery for this call. |
| `noAllowanceOverride: true` | Caller has already approved direct allowance / Permit2 for the spenders this plan needs. | Per-call `allowance` reads. Permit2 deterministic overrides are still emitted (they cost no RPC). |
| `wallet.balances[token]` | UI already holds a wallet balance snapshot for this token. | The `balanceOf` RPC for `token` when the snapshot ≥ the plan's required amount. Falls through otherwise. |
| `wallet.allowances[token:spender]` | UI knows the user has an unlimited allowance (e.g. set during onboarding). | The `allowance` RPC when set to `maxUint256`. |
| `slotHints[token]` | Pre-fetched once with `fetchErc20SlotHints`. | `eth_createAccessList` discovery on every estimate/sim. |

### Priming slot hints

Slot hints are owner-/spender-agnostic, deterministic per-token storage layouts. Compute them once per token and reuse forever:

```typescript
import { fetchErc20SlotHints, fetchErc20SlotHintsBatch } from "@eulerxyz/euler-v2-sdk"

const hints = await fetchErc20SlotHints(provider, token, {
  // Optional: a known approver makes the allowance-slot probe deterministic.
  allowanceSpender: permit2Address,
})

// Or batch:
const hintMap = await fetchErc20SlotHintsBatch(provider, [tokenA, tokenB, tokenC], {
  allowanceSpender: permit2Address,
})
```

Successful probes are also cached in a module-scope `slotHintsCache` keyed on chain ID + token. `getCachedSlotHints(chainId, token)` reads it; `primeSlotHintsCache(chainId, hints)` writes pre-computed entries (useful for hydration from a backend).

Pass the result on every subsequent `simulate*` / `estimateGas*` / `prepare*` call via `stateOverrideOptions.slotHints` and the SDK derives slots cryptographically instead of probing.

### Recommended pattern for UI fan-outs

For a form that simulates N candidate plans per user interaction (e.g. one swap quote per provider):

1. **On form mount** — call `fetchErc20SlotHints` for each relevant token. Reuse the returned map.
2. **Per simulate/estimate call** — assemble `SimulationStateOverrideOptions` from the form's already-validated wallet snapshot + the slot-hint map, with `noBalanceOverride: true` when the form gates submit on balance.
3. **For per-plan plugin work** — see `prefetchPluginDataForPlan` in [Execution Service](./execution-service.md#prefetching-plugin-data) so the sweep does one Hermes pull + one Keyring read instead of N.

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
