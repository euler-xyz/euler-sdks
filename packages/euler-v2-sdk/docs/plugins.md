# Plugins

Some vaults require extra on-chain actions before they can be read from or written to. For example, a vault that uses Pyth oracles needs fresh price data pushed on-chain before any read or transaction, and a vault protected by Keyring hooks needs a valid credential created before the user can interact with it.

Plugins let you handle these cases transparently. They hook into the SDK's read and write paths so the necessary actions are automatically prepended to your operations.

## Architecture

### Initialization

Plugins are passed to `buildEulerSDK` via the `plugins` option:

```typescript
import { buildEulerSDK, createPythPlugin, createKeyringPlugin } from "@euler-xyz/euler-v2-sdk"

const sdk = await buildEulerSDK({
  rpcUrls: { 1: "https://..." },
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

The SDK wires read-path plugins into the onchain adapter (where the actual chain calls happen) and makes them available on the `sdk.plugins` array and through `sdk.processPlugins()`.

### Hooks

Each plugin implements the `EulerPlugin` interface and can hook into two points:

| Hook | When it runs | Purpose |
|---|---|---|
| `getReadPrepend` | Before lens reads (via `batchSimulation`) | Returns batch items that are atomically prepended to the simulated call, injecting state changes (e.g. price updates) without an on-chain transaction. |
| `processPlan` | Before a transaction plan is executed | Transforms the plan by prepending batch items to the first `evcBatch` entry (e.g. oracle updates, credential creation). |

Plugins execute in array order. Each receives the plan as modified by the previous plugin. Errors in individual plugins are caught gracefully &mdash; the operation proceeds without that plugin's enrichment.

## Available Plugins

### Pyth (`createPythPlugin`)

Handles vaults that rely on Pyth pull oracles. The plugin inspects each vault's oracle adapters for Pyth price feeds, fetches the latest update data from Hermes, and prepends `updatePriceFeeds` calls.

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
