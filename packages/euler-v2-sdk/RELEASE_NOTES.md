# euler-v2-sdk v1.0.6

## Summary

This release fixes wallet shortfall diagnostics for batched wallet-sourced deposits funded by earlier simulated operations.

## Highlights

- Required-approval wallet tokens are now included in simulation wallet balance layers.
- Batched deposits can use wallet funds created by earlier withdraw or swap steps before reporting a missing wallet balance.
- Empty computed wallet shortfalls no longer fall back to static approval diagnostics.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
