# Euler V2 SDK publish flow

`@eulerxyz/euler-v2-sdk` is released by the local `$publish` skill. The package still uses `packages/euler-v2-sdk/package.json` as npm's version source, and npm publishing stays interactive so the operator can complete 2FA when npm asks for a one-time password.

Git tags and GitHub Releases are the release-note source of truth. Do not add package-local changelog or release-notes files for new SDK releases.

## Release inputs

The publish skill should use this file as the repo-local playbook for `@eulerxyz/euler-v2-sdk` releases.

- Package directory: `packages/euler-v2-sdk`
- Package name: `@eulerxyz/euler-v2-sdk`
- Tag format: `euler-v2-sdk-vX.Y.Z`
- Release gate: `pnpm -C packages/euler-v2-sdk run release:check`
- Publish command: `npm publish --access public --provenance=false` from `packages/euler-v2-sdk`
- GitHub Release title: `euler-v2-sdk vX.Y.Z`

## Operator flow

1. Run `$publish` from the repository.
2. Let the skill inspect this playbook, `packages/euler-v2-sdk/package.json`, existing `euler-v2-sdk-v*` tags, and npm's current published version.
3. Let the skill derive the next version from the requested semver bump.
4. Let the skill generate the changelist from the actual diff since the previous `euler-v2-sdk-v*` tag. Prefer merged PR metadata when available, and validate the notes against the final net diff.
5. Let the skill update only `packages/euler-v2-sdk/package.json` for the version bump.
6. Merge the release PR to `main`; `main` is protected, so releases do not push directly to it.
7. From the merged `main` commit, let the skill run the release gate, create and push the annotated tag, publish to npm, and create or update the GitHub Release.

## Manual command sequence

The publish skill should run the same sequence with confirmation before publishing:

```sh
git fetch origin main --tags
git switch main
git pull --ff-only origin main
pnpm -C packages/euler-v2-sdk run release:check
git tag -a euler-v2-sdk-vX.Y.Z -m "euler-v2-sdk-vX.Y.Z"
git push origin euler-v2-sdk-vX.Y.Z
cd packages/euler-v2-sdk
npm publish --access public --provenance=false
cd ../..
gh release create euler-v2-sdk-vX.Y.Z --title "euler-v2-sdk vX.Y.Z" --notes "<generated changelist>"
```

For prereleases, publish with npm's matching dist-tag:

```sh
npm publish --access public --tag beta --provenance=false
```

## Auth and 2FA

Use the operator's local npm session for publishing. If npm prompts for a one-time password, enter the current 2FA code and continue the publish. The package `prepublishOnly` hook runs `pnpm run release:check`, so npm publishing re-runs the release gate immediately before registry publication.

After publishing, verify npm and GitHub:

```sh
npm view @eulerxyz/euler-v2-sdk@X.Y.Z version dist.tarball dist.integrity
gh release view euler-v2-sdk-vX.Y.Z
```
