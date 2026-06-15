# euler-v2-sdk v1.0.4

## Summary

This release improves batch simulation readbacks, reward stream handling, and wallet-balance tracking for claim and unlock flows.

## Highlights

- Reward streams are exposed on account positions and can be fetched and claimed through the rewards service.
- EVC batch simulations track wallet balance metadata across reward claims, rEUL unlocks, and cleanup reads.
- Approval and balance override fallback behavior handles unavailable access-list discovery without retrying the same unavailable path.
- Simulation wallet balance requirements sum repeated token needs before checking available balances.
- Direct `Account` construction normalizes sub-account map keys to checksum addresses.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
