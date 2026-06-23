# AGENTS.md instructions for euler-sdks

## Skills

### Available skills
- `euler-sdk`: Euler V2 SDK integration guide for building production UIs, bots, scripts, and tooling. Use the canonical skill from [`euler-xyz/agent-skills`](https://github.com/euler-xyz/agent-skills/tree/main/skills/euler-sdk) for tasks involving `buildEulerSDK`, SDK services (`accountService`, `vaultMetaService`, `walletService`, `executionService`, `swapService`, `reulLockService`), React Query integration, or SDK examples in `packages/euler-v2-sdk/examples/`.

### How to use skills
- Trigger rule: If user asks for SDK integration help or names `euler-sdk`, load and follow the canonical `euler-sdk` skill from `euler-xyz/agent-skills`.
- Load minimally: Open `SKILL.md` first, then only the rule files needed for the current task.
- Treat the SDK implementation docs and examples in this repository as source material for SDK behavior, and treat `euler-xyz/agent-skills` as the source of truth for packaged agent skill instructions.
