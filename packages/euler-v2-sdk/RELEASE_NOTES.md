# euler-v2-sdk v0.2.3-beta

## Summary

This beta release tightens V3 read-path compatibility by restoring the SDK's USD-value property surface, adding optional diagnostic parsing, and fixing Euler Earn label resolution.

## Highlights

- Restored account and portfolio USD-value property names while preserving market-value semantics for consumers.
- Added optional V3 diagnostic parsing for account, EVault, and Euler Earn adapters.
- Fixed Euler Earn label lookup behavior.
- Added regression coverage for optional diagnostics, parsing, Earn labels, and portfolio value fields.
- Updated SDK UI data-layer guidance for market-price and USD-value fields.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
