# AGENTS.md instructions for euler-sdks

## Skills

### Available skills

- `euler-sdk`: Euler V2 SDK integration guide for building production UIs, bots, scripts, and tooling. Use the canonical [Euler SDK skill](https://github.com/euler-xyz/agent-skills/blob/main/skills/euler-sdk/SKILL.md) for tasks involving `buildEulerSDK`, SDK services (`accountService`, `portfolioService`, `vaultMetaService`, `walletService`, `executionService`, `swapService`, `positionMigrationService`), React Query integration, or SDK examples in `packages/euler-v2-sdk/examples/`.

### How to use skills

- Trigger rule: If the user asks for SDK integration help or names `euler-sdk`, load and follow the canonical skill linked above. Install it with `npx skills add euler-xyz/agent-skills --skill euler-sdk`.
- Load minimally: Open the canonical `SKILL.md` first, then only the rule files needed for the current task from the same `euler-xyz/agent-skills` revision.
- SDK behavior is defined by the implementation, docs, and examples in this repository. Packaged agent skill instructions are maintained in `euler-xyz/agent-skills`; update them there when SDK behavior changes.
