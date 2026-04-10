---
title: SDK Architecture and Service Boundaries
impact: HIGH
impactDescription: Prevents incorrect service usage and missing data in app state
tags: sdk, architecture, services, buildEulerSDK, vaultMetaService
---

## SDK Architecture and Service Boundaries

Initialize the SDK once, treat services as layered APIs, and pick the right service boundary for each task.

**Incorrect (using typed vault service when vault type is unknown):**

```typescript
// WRONG: Fails for non-EVault addresses
const vault = await sdk.eVaultService.fetchVault(chainId, maybeAnyVault);
```

**Correct (route by type with vaultMetaService):**

```typescript
const vault = await sdk.vaultMetaService.fetchVault(chainId, maybeAnyVault, {
  populateMarketPrices: true,
  populateRewards: true,
  populateIntrinsicApy: true,
  populateLabels: true,
});
```

**Correct build pattern (single composition root):**

```typescript
import { buildEulerSDK } from "euler-v2-sdk";

const sdk = await buildEulerSDK({
  rpcUrls: {
    1: process.env.MAINNET_RPC!,
    8453: process.env.BASE_RPC!,
  },
});
```

Use these default boundaries:

- `accountService`: account/sub-account portfolio state
- `vaultMetaService`: mixed/unknown vault types
- `executionService`: `planX`/`encodeX`, approvals, batch encoding
- `simulationService`: plan validation and post-state preview
- `swapService`: quotes and providers
- `oracleAdapterService`: oracle adapter metadata (provider/methodology/checks)

Reference: `packages/euler-v2-sdk/docs/services.md`, `docs/data-architecture.md`, `src/sdk/buildSDK.ts`
