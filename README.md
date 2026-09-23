## Euler SDKs

A monorepo for Euler SDKs and tools.

### Packages

- [@eulerxyz/euler-v2-sdk](./packages/euler-v2-sdk/README.md) - Main SDK for interacting with Euler V2 lending platform.

### Examples

- [examples/](./packages/euler-v2-sdk/examples/) - TypeScript script examples (deposits, borrows, swaps, liquidations, etc.)
- [examples/react-sdk-example/](./packages/euler-v2-sdk/examples/react-sdk-example/) - Full React app example with React Query and Wagmi.

### Agent Skills

The [Euler SDK skill](https://github.com/euler-xyz/agent-skills/blob/main/skills/euler-sdk/SKILL.md) provides integration guidance for `@eulerxyz/euler-v2-sdk` and is maintained in [`euler-xyz/agent-skills`](https://github.com/euler-xyz/agent-skills).

```bash
npx skills add euler-xyz/agent-skills --skill euler-sdk
```

See [`AGENTS.md`](./AGENTS.md) for agent usage guidance. SDK implementation documentation and examples are maintained in [`packages/euler-v2-sdk/docs/`](./packages/euler-v2-sdk/docs/) and [`packages/euler-v2-sdk/examples/`](./packages/euler-v2-sdk/examples/).
