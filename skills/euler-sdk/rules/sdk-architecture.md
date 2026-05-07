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
const { result: vault, errors } = await sdk.vaultMetaService.fetchVault(chainId, maybeAnyVault, {
  populateMarketPrices: true,
  populateRewards: true,
  populateIntrinsicApy: true,
  populateLabels: true,
});

if (!vault) throw new Error(errors[0]?.message ?? "Vault could not be resolved");
```

**Correct build pattern (single composition root):**

```typescript
import { buildEulerSDK } from "euler-v2-sdk";

// Set EULER_SDK_RPC_URL_<chainId> in the environment for on-chain reads.
const sdk = await buildEulerSDK({
  config: {
    v3ApiUrl: process.env.EULER_SDK_V3_API_URL,
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
  },
});
```

Built-in scalar config resolves as `config` prop, explicit SDK option, `EULER_SDK_*` env var, then default. Use `packages/euler-v2-sdk/docs/config-through-env.md` when adding runtime config.

Use these default boundaries:

- `accountService`: account/sub-account portfolio state
- `vaultMetaService`: mixed/unknown vault types
- `walletService`: native/ERC20 wallet balances and direct/Permit2 allowance state
- `executionService`: `planX`/`encodeX`, approvals, batch encoding
- `executionService`: transaction planning, execution, plan validation, and post-state preview
- `swapService`: quotes and providers
- `rewardsService`: reward reads and provider-specific claim planning
- `eulerLabelsService`: normalized off-chain labels metadata; use exported helpers from `utils/eulerLabels` for product/vault flags, notices, and restrictions
- `oracleAdapterService`: oracle adapter metadata keyed by normalized `adapter.oracle` address

All service `fetch*` methods return `{ result, errors }`; keep diagnostics with the fetched entity when rendering warnings or enforcing data-quality policy.

Reference: `packages/euler-v2-sdk/docs/services.md`, `packages/euler-v2-sdk/docs/config-through-env.md`, `packages/euler-v2-sdk/docs/wallet-service.md`, `packages/euler-v2-sdk/docs/entity-diagnostics.md`, `docs/data-architecture.md`, `src/sdk/buildSDK.ts`
