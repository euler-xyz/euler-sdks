# Plugins

Some vaults require extra on-chain actions before they can be read from or written to. For example, a vault that uses Pyth oracles needs fresh price data pushed on-chain before any read or transaction, and a vault protected by Keyring hooks needs a valid credential created before the user can interact with it.

Plugins let you handle these cases transparently. They hook into the SDK's read and write paths so the necessary actions are automatically prepended to your operations.

## Architecture

### Initialization

Plugins are passed to `buildEulerSDK` via the `plugins` option:

```typescript
import { buildEulerSDK, createPythPlugin, createKeyringPlugin } from "@eulerxyz/euler-v2-sdk"

const sdk = await buildEulerSDK({
  plugins: [
    createPythPlugin(),
    createKeyringPlugin({
      hookTargets: { 1: ["0x..."] },
      getCredentialData: async ({ chainId, account, hookTarget, policyId }) => {
        // fetch credential from Keyring Connect SDK
      },
    }),
  ],
})
```

The SDK wires read-path plugins into the onchain adapter (where the actual chain calls happen) and wires write-path plugins into `executionService.simulateTransactionPlan`, `executionService.estimateGasForTransactionPlan`, and `executionService.executeTransactionPlan`. App code should normally call those execution-service methods directly; they process plugins before simulating, estimating, or executing.

### Hooks

Each plugin implements the `EulerPlugin` interface and can hook into two points:

| Hook | When it runs | Purpose |
|---|---|---|
| `getReadPrepend` | Before lens reads (via `batchSimulation`) | Returns batch items that are atomically prepended to the simulated call, injecting state changes (e.g. price updates) without an on-chain transaction. |
| `processPlan` | Before a transaction plan is simulated, gas-estimated, or executed | Transforms the plan by prepending batch items to relevant `evcBatch` entries (e.g. oracle updates, credential creation). |

`processPlan` receives `(plan, account, chainId, sdk)`, where `account` is `AddressOrAccount` (`Address | Account`) and `sdk` is the full SDK instance. This lets plugins use any SDK service without a plugin-specific context object.

Plugins execute in array order. Each receives the plan as modified by the previous plugin. Errors in individual plugins are caught gracefully &mdash; the operation proceeds without that plugin's enrichment.

## Available Plugins

### Pyth (`createPythPlugin`)

Handles vaults that rely on Pyth pull oracles. On the write path, the plugin uses the generic health-check set calculation (`utils/healthCheckSets.ts`) to scan EVC batches for operations that schedule account health checks, derive each checked account's effective controllers and collaterals at that batch, inspect the controller oracle routes for those pairs, fetch the latest update data from Hermes, and prepend `updatePriceFeeds` calls to the relevant batch.

If `processPlan` receives an address, the plugin fetches the account with minimal vault population. If it receives an `Account`, the plugin uses it directly when it already has vaults populated, otherwise it minimally populates vaults first.

- **Read path** &mdash; injects price updates into `batchSimulation` so lens reads return values based on fresh prices.
- **Write path** &mdash; prepends price updates to the EVC batch so the transaction executes with up-to-date oracle data.

Hermes requests are automatically batched (50 ms window) and cached (15 s TTL) to minimize external calls.

```typescript
createPythPlugin({
  hermesUrl: "https://hermes.pyth.network", // optional, this is the default
})
```

See [`examples/execution/borrow-with-pyth-example.ts`](../examples/execution/borrow-with-pyth-example.ts) for a complete working example that borrows WBTC against LBTC collateral with Pyth price updates.

### Keyring (`createKeyringPlugin`)

Handles vaults that use Keyring compliance hooks. The plugin checks if the sender already holds a valid credential for each relevant vault and, if not, prepends a `createCredential` call.

If `processPlan` receives an `Account`, Keyring only uses vault entities already present on that account to check hooks. It fetches vaults only when the account argument is an address.

- **Read path** &mdash; not affected (Keyring does not gate reads).
- **Write path** &mdash; prepends credential creation to the EVC batch when the sender lacks a valid credential.

```typescript
createKeyringPlugin({
  // known hook target addresses per chain
  hookTargets: { 1: ["0x..."] },
  // called when a credential is needed; return null to skip
  getCredentialData: async ({ chainId, account, hookTarget, policyId }) => {
    // integrate with Keyring Connect SDK to obtain credential data
    return { trader, policyId, chainId, validUntil, cost, key, signature, backdoor }
  },
})
```
