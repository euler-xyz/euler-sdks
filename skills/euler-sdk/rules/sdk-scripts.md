---
title: Script and Tooling Workflows from SDK Examples
impact: MEDIUM
impactDescription: Speeds up reliable bot/script development with proven patterns
tags: scripts, examples, automation, anvil, fork-testing
---

## Script and Tooling Workflows from SDK Examples

Use `packages/euler-v2-sdk/examples/` as canonical templates for script structure, then parameterize config/env.

Suggested workflow:

1. Start from nearest example (`deposit`, `repay-with-swap`, `liquidation`, etc.).
2. Move chain/account/vault constants into a shared `config.ts`.
3. Use `sdk.executionService.executeTransactionPlan(...)` for plugin processing, approval resolution, Permit2, and EVC batch execution.
4. Add simulation gates before submission for bots.
5. Run against fork first (Anvil), then production RPC.

**Correct starting points:**

- `packages/euler-v2-sdk/examples/execution/*.ts` for transaction flows
- `packages/euler-v2-sdk/examples/simulations/*.ts` for safety checks
- `sdk.executionService.executeTransactionPlan(...)` for plugin-aware execution plumbing
- `packages/euler-v2-sdk/examples/run-examples.sh` for local fork regression pass

When building CLI tools, prefer idempotent commands and explicit chain/account flags.

Reference: `packages/euler-v2-sdk/examples/`, `packages/euler-v2-sdk/examples/run-examples.sh`
