# euler-v2-sdk v1.0.4

## Summary

This release publishes the prepared SDK changes under `1.0.4` after `1.0.3` was already present on npm.

## Highlights

- Reward streams are exposed on account positions and can be fetched and claimed through the rewards service.
- EVC batch simulations track wallet balance metadata across operations, cleanup reads, and reward-claim balance changes.
- Approval and balance override fallback behavior handles unavailable access-list discovery without retrying the same unavailable path.
- Token list entries preserve tag metadata for downstream classification and display.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
