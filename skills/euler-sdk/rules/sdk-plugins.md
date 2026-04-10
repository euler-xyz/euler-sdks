---
title: Plugin Integration for Read and Write Preconditions
impact: HIGH
impactDescription: Prevents stale-oracle and credential-gating failures
tags: plugins, pyth, keyring, processPlan, batchSimulation
---

## Plugin Integration for Read and Write Preconditions

Use plugins whenever vault interactions require preconditions that are not part of core calls.

**Correct initialization with plugin support:**

```typescript
import { buildEulerSDK, createPythPlugin, createKeyringPlugin } from "euler-v2-sdk";

const sdk = await buildEulerSDK({
  rpcUrls,
  plugins: [
    createPythPlugin(),
    createKeyringPlugin({
      hookTargets,
      getCredentialData: async (args) => fetchCredential(args),
    }),
  ],
});
```

Plugin behavior:

- `getReadPrepend`: prepends calls before lens reads (`batchSimulation` path)
- `processPlan`: prepends calls to first `evcBatch` before execution

Guidelines:

1. Keep plugin list deterministic and ordered.
2. Use same `buildQuery` wrapper for plugin queries where possible.
3. For plan previews, run `sdk.processPlugins(plan, args)` before simulation/execution parity checks.

Reference: `packages/euler-v2-sdk/docs/plugins.md`, `src/plugins/pyth/pythPlugin.ts`, `src/plugins/keyring/keyringPlugin.ts`
