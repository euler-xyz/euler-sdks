---
title: Script and Tooling Workflows from SDK Examples
impact: MEDIUM
impactDescription: Speeds up reliable bot/script development with proven patterns
tags: scripts, examples, automation, anvil, fork-testing
---

## Script and Tooling Workflows from SDK Examples

Use `examples/` as canonical templates for script structure, then parameterize config/env.

Suggested workflow:

1. Start from nearest example (`deposit`, `repay-with-swap`, `liquidation`, etc.).
2. Move chain/account/vault constants into a shared `config.ts`.
3. Reuse executor pattern for approval + Permit2 + EVC batch.
4. Add simulation gates before submission for bots.
5. Run against fork first (Anvil), then production RPC.

**Correct starting points:**

- `examples/execution/*.ts` for transaction flows
- `examples/simulations/*.ts` for safety checks
- `examples/utils/executor.ts` for execution plumbing
- `run-examples.sh` for local fork regression pass

When building CLI tools, prefer idempotent commands and explicit chain/account flags.

Reference: `examples/`, `examples/run-examples.sh`
