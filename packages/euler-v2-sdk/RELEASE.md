# Euler V2 SDK publish flow

`@eulerxyz/euler-v2-sdk` is released by the local `$publish` skill. The release tag is the source of truth for the published version and commit hash, and npm publishing stays interactive so the operator can complete 2FA when npm asks for a one-time password.

Git tags and GitHub Releases are the release-note source of truth. Do not add package-local changelog or release-notes files for new SDK releases.

## SDK 2.1 compatibility

SDK 2.1 requires feed-aligned Pyth `publishTimes` evidence, includes
materialized-execution methods on `IExecutionService`, and includes
`prepareMigrationAuthorizationSlots` on `IPositionMigrationService`. Custom
interface implementations and custom Pyth prefetch payloads must implement
their respective SDK 2.1 contracts.

## Release inputs

The publish skill should use this file as the repo-local playbook for `@eulerxyz/euler-v2-sdk` releases.

- Package directory: `packages/euler-v2-sdk`
- Package name: `@eulerxyz/euler-v2-sdk`
- Tag format: `euler-v2-sdk-vX.Y.Z`
- Prerelease tag format: `euler-v2-sdk-vX.Y.Z-beta.N`, `euler-v2-sdk-vX.Y.Z-rc.N`, or `euler-v2-sdk-vX.Y.Z-alpha.N`
- Release gate: `pnpm -C packages/euler-v2-sdk run release:check`
- Publish command: `npm publish --access public --provenance=false` from `packages/euler-v2-sdk`
- Prerelease publish command: `npm publish --access public --tag <prerelease-id> --provenance=false` from `packages/euler-v2-sdk`
- GitHub Release title: `euler-v2-sdk vX.Y.Z`

## Operator flow

1. Run `$publish` from the repository.
2. Let the skill inspect this playbook, `packages/euler-v2-sdk/package.json`, existing `euler-v2-sdk-v*` tags, and npm's current published version.
3. Let the skill derive the next release tag and npm version from the requested semver bump.
4. Let the skill generate the changelist from the actual diff since the previous `euler-v2-sdk-v*` tag. Prefer merged PR metadata when available, and validate the notes against the final net diff.
5. From the selected `main` commit, let the skill verify npm auth, run the release gate, create and push the annotated tag, temporarily set `packages/euler-v2-sdk/package.json` to the tag version for npm, dry-run the package, publish to npm, restore the working tree, and create or update the GitHub Release.

## Manual command sequence

The publish skill should run the same sequence with confirmation before publishing:

```sh
VERSION=X.Y.Z
TAG=euler-v2-sdk-vX.Y.Z
NOTES_FILE=/tmp/euler-v2-sdk-vX.Y.Z-notes.md

git fetch origin main --tags
git switch main
git pull --ff-only origin main
npm whoami
npm view @eulerxyz/euler-v2-sdk version dist-tags --json
npm view @eulerxyz/euler-v2-sdk@$VERSION version --json || true
pnpm -C packages/euler-v2-sdk run release:check
git tag -a $TAG -m "$TAG"
git push origin $TAG
cd packages/euler-v2-sdk
npm pkg set version=$VERSION
npm pack --dry-run
npm publish --access public --provenance=false
git restore package.json
cd ../..
gh release create $TAG --verify-tag --title "euler-v2-sdk v$VERSION" --notes-file "$NOTES_FILE"
```

For prereleases, use a prerelease version and npm's matching dist-tag:

```sh
VERSION=X.Y.Z-beta.0
TAG=euler-v2-sdk-vX.Y.Z-beta.0
DIST_TAG=beta
NOTES_FILE=/tmp/euler-v2-sdk-vX.Y.Z-beta.0-notes.md

git fetch origin main --tags
git switch main
git pull --ff-only origin main
npm whoami
npm view @eulerxyz/euler-v2-sdk version dist-tags --json
npm view @eulerxyz/euler-v2-sdk@$VERSION version --json || true
pnpm -C packages/euler-v2-sdk run release:check
git tag -a $TAG -m "$TAG"
git push origin $TAG
cd packages/euler-v2-sdk
npm pkg set version=$VERSION
npm pack --dry-run
npm publish --access public --tag $DIST_TAG --provenance=false
git restore package.json
cd ../..
gh release create $TAG --verify-tag --title "euler-v2-sdk v$VERSION" --notes-file "$NOTES_FILE" --prerelease
```

## Auth and 2FA

Use the operator's local npm session for publishing. Verify the session with `npm whoami` before pushing the release tag. During `npm publish`, npm may ask for a one-time password or print a browser authentication URL. Complete the prompt and keep the publish process running until it exits successfully.

npm requires a concrete package version at publish time, so the publish flow temporarily writes the tag version into `packages/euler-v2-sdk/package.json` before `npm pack --dry-run` and `npm publish`, then restores the file.

Use a real notes file path with `gh release create --notes-file`; do not paste angle-bracket placeholders into the shell.

After publishing, verify npm and GitHub:

```sh
npm view @eulerxyz/euler-v2-sdk@X.Y.Z version dist.tarball dist.integrity
npm view @eulerxyz/euler-v2-sdk version dist-tags --json
gh release view euler-v2-sdk-vX.Y.Z
```
