# Simulations & State Overrides

Euler SDK provides helpers for simulating transactions without requiring the connected account to hold tokens or have approvals in place. This is done via **state overrides** — temporary storage modifications passed to `eth_call` that let you inject ERC20 balances, allowances, and native ETH into any address for the duration of the call.

## Quick start

```typescript
import { createPublicClient, http } from "viem"
import { mainnet } from "viem/chains"
import {
  buildEulerSDK,
  getSubAccountAddress,
  getStateOverrides,
  ethereumVaultConnectorAbi,
  type EVCBatchItem,
  type EVCBatchItems,
} from "euler-v2-sdk"

const client = createPublicClient({ chain: mainnet, transport: http(RPC_URL) })
const sdk = await buildEulerSDK({ rpcUrls: { [mainnet.id]: RPC_URL } })
const deployment = sdk.deploymentService.getDeployment(mainnet.id)

// 1. Create a plan
const plan = sdk.executionService.planDeposit({ vault, amount, receiver, account, asset })

// 2. Generate state overrides from the plan
const stateOverride = await getStateOverrides(client, plan, account, {
  permit2Address: deployment.addresses.coreAddrs.permit2,
})

// 3. Extract batch items (skip RequiredApprovals — overrides handle them)
const batchItems: EVCBatchItem[] = plan
  .filter((item): item is EVCBatchItems => item.type === "evcBatch")
  .flatMap((item) => item.items)

// 4. Simulate via EVC batchSimulation
const { result } = await client.simulateContract({
  address: deployment.addresses.coreAddrs.evc,
  abi: ethereumVaultConnectorAbi,
  functionName: "batchSimulation",
  args: [batchItems],
  account: accountAddress,
  stateOverride,
})
```

See `examples/simulations/simulate-deposit-example.ts` for a full runnable example:

```
npx tsx examples/simulations/simulate-deposit-example.ts
```

## State override utilities

All exports are available from the top-level `euler-v2-sdk` package.

### `getStateOverrides(client, plan, account, options)`

The main entry point. Takes a `TransactionPlan` and generates all the overrides needed to simulate it from `account`, even if that account has no tokens or approvals.

```typescript
const stateOverride = await getStateOverrides(client, plan, account, {
  permit2Address: deployment.addresses.coreAddrs.permit2,
  nativeBalance: parseEther("1000"), // optional, defaults to 1000 ETH
})
```

**What it does internally:**

1. **Extracts balance requirements** — walks the plan's `RequiredApproval` items to find which tokens and amounts the account needs.
2. **Generates balance overrides** — for each token with insufficient balance, uses `eth_createAccessList` to discover the `balanceOf` storage slot, then creates a `stateDiff` entry that sets that slot to the required value.
3. **Generates approval overrides** — computes Permit2 allowance storage slots deterministically (keccak256 mapping layout) and traces ERC20 `approve()` calls to discover approval storage slots.
4. **Adds native balance** — sets the account's ETH balance (for gas and any native-asset operations).
5. **Merges** — consolidates all overrides by address, concatenating `stateDiff` arrays.

**RPC requirement:** the client must support `eth_createAccessList` (EIP-2930) and `eth_call` with state overrides. These are standard RPC methods supported by all major providers. If access list creation is unavailable, balance/approval slot discovery is silently skipped.

### `getBalanceOverrides(client, account, tokens)`

Lower-level helper. Generates `StateOverride` entries for ERC20 token balances.

```typescript
import { getBalanceOverrides } from "euler-v2-sdk"

const overrides = await getBalanceOverrides(client, account, [
  [USDC_ADDRESS, parseUnits("10000", 6)],
  [WETH_ADDRESS, parseEther("5")],
])
```

For each token, it:
- Reads the current balance; skips if already sufficient
- Uses `eth_createAccessList` on `balanceOf(account)` to find candidate storage slots
- Tests each slot by overriding it and re-reading `balanceOf`
- Picks the slot that produces the highest balance
- Caches discovered slots in memory for subsequent calls

### `getApprovalOverrides(client, account, approvals, permit2Address)`

Lower-level helper. Generates `StateOverride` entries for ERC20 approvals and Permit2 allowances.

```typescript
import { getApprovalOverrides } from "euler-v2-sdk"

const overrides = await getApprovalOverrides(client, account, [
  [USDC_ADDRESS, VAULT_ADDRESS], // [asset, spender]
], permit2Address)
```

This:
- Computes Permit2 allowance slots deterministically via keccak256
- Traces `approve()` calls to find the actual ERC20 allowance storage slots
- Handles tokens that require approval reset before setting to max (USDT, LIDO, NMR, MNW)

### `computePermit2StateDiff(account, approvals)`

Pure function. Computes the Permit2 storage slots for the given `[asset, spender]` pairs without any RPC calls.

```typescript
import { computePermit2StateDiff } from "euler-v2-sdk"

const stateDiff = computePermit2StateDiff(account, [
  [USDC_ADDRESS, VAULT_ADDRESS],
])
// Returns StateMapping: [{ slot, value }, ...]
```

### `mergeStateOverrides(overrides)`

Combines multiple `StateOverride` arrays into one, deduplicating by address and concatenating `stateDiff` entries.

```typescript
import { mergeStateOverrides } from "euler-v2-sdk"

const merged = mergeStateOverrides([
  ...balanceOverrides,
  ...approvalOverrides,
  { address: account, balance: parseEther("100") },
])
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

This pattern lets you simulate a transaction and read back any resulting state in a single `eth_call`.

### Skipping approvals in simulation

When using state overrides, the `RequiredApproval` items in a `TransactionPlan` can be skipped — the overrides inject the necessary allowances directly into storage. Only the `evcBatch` items need to be passed to `batchSimulation`:

```typescript
const batchItems = plan
  .filter((item): item is EVCBatchItems => item.type === "evcBatch")
  .flatMap((item) => item.items)
```
