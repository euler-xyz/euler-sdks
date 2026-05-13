# euler-v2-sdk v0.2.2-beta

## Summary

This beta release refreshes the V3 read-path defaults, adds bad-debt inspection coverage in the React example, expands reward metadata support, and tightens planner and oracle metadata handling.

## Highlights

- Added the React example bad debt explorer.
- Added asset-denominated redeem planning support.
- Switched tokenlist reads to the V3 tokenlist endpoint with base-token default filtering.
- Improved SDK query cache keys and external query caching documentation.
- Hardened reward/Pyth claim target handling and exact-out swap quote checks.
- Fixed resolved vault metadata handling.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
