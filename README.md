See [euler-v2-sdk](./packages/euler-v2-sdk/README.md)

## Agent Skills

This repository vendors the `euler-sdk` agent skill at [`packages/euler-v2-sdk/skills/euler-sdk`](./packages/euler-v2-sdk/skills/euler-sdk).
Current skill version: `1.1.0` (see [`packages/euler-v2-sdk/skills/euler-sdk/CHANGELOG.md`](./packages/euler-v2-sdk/skills/euler-sdk/CHANGELOG.md)).

For agent discovery without user installation:
- Keep skills in package under `packages/euler-v2-sdk/skills/<name>` with `SKILL.md`, optional `AGENTS.md`, and any referenced `rules/` files.
- Keep a repo-level [`AGENTS.md`](./AGENTS.md) that lists local skills and exact file paths.
- Keep skill discovery mentions at the repository top level (`README.md` and `AGENTS.md`).
