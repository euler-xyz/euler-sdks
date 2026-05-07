# AGENTS.md instructions for euler-sdks

## Skills

### Available skills
- `euler-sdk` (v1.1.1): Euler V2 SDK integration guide for building production UIs, bots, scripts, and tooling. Use for tasks involving `buildEulerSDK`, SDK services (`accountService`, `portfolioService`, `vaultMetaService`, `executionService`, `swapService`), React Query integration, or SDK examples in `packages/euler-v2-sdk/examples/`. (file: `./skills/euler-sdk/SKILL.md`)

### How to use skills
- Trigger rule: If user asks for SDK integration help or names `euler-sdk`, load and follow `./skills/euler-sdk/SKILL.md`.
- Load minimally: Open `SKILL.md` first, then only the rule files needed for the current task.
- Prefer local skill files in this repository over globally installed copies when both exist.
