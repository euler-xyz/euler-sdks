# Euler V2 SDK release flow

`@eulerxyz/euler-v2-sdk` releases are tag-driven once the release PR is merged to `main`. The npm package is published only from a matching `euler-v2-sdk-vX.Y.Z` tag after CI validates the package metadata and runs the package release gate.

## Release preparation

1. Create a release branch from `main`.
2. Update `packages/euler-v2-sdk/package.json` to the intended version.
3. Add a dated entry to `packages/euler-v2-sdk/CHANGELOG.md`.
4. Update `packages/euler-v2-sdk/RELEASE_NOTES.md`; the first heading must be `# euler-v2-sdk vX.Y.Z`.
5. Run the release gate locally:

   ```sh
   pnpm -C packages/euler-v2-sdk run release:check
   ```

6. Open and merge the release PR into `main`.

## Publish

After the release PR is merged, create and push the release tag from the merged `main` commit:

```sh
git fetch origin main --tags
git switch main
git pull --ff-only origin main
node scripts/validate-euler-v2-sdk-release.mjs euler-v2-sdk-vX.Y.Z
git tag -a euler-v2-sdk-vX.Y.Z -m "euler-v2-sdk-vX.Y.Z"
git push origin euler-v2-sdk-vX.Y.Z
```

The `Release euler-v2-sdk` workflow checks out that tag, validates that the tag matches `packages/euler-v2-sdk/package.json`, confirms the changelog and release notes mention the same version, runs `pnpm -C packages/euler-v2-sdk run release:check`, publishes `@eulerxyz/euler-v2-sdk` to npm, and creates or updates the GitHub Release from `RELEASE_NOTES.md`. If the exact package version is already on npm, a rerun skips the duplicate publish and still reconciles the GitHub Release.

Stable versions publish with the `latest` npm dist-tag. Prerelease versions publish with the first prerelease identifier as the npm dist-tag, for example `1.1.0-beta.0` publishes with `--tag beta`.

## Manual dry run

The workflow also supports a manual `workflow_dispatch` run against an existing tag. Leave `dry_run` enabled to run the validation and package dry-run without publishing to npm or changing the GitHub Release.

## Publishing credentials

The workflow is configured for npm trusted publishing with GitHub Actions OIDC and also accepts the `NPM_TOKEN` repository secret as a fallback. The npm trusted publisher, when used, must point at the `release-euler-v2-sdk.yml` workflow filename for the `euler-xyz/euler-sdks` repository.
