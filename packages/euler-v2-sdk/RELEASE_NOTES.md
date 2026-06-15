# euler-v2-sdk v1.0.5

## Summary

This release fixes collateral simulation readbacks for Securitize vaults and direct spender allowance overrides.

## Highlights

- Securitize collateral vaults are included in simulation readbacks and stitched from ERC4626, governor, and resolved supply-cap reads.
- Securitize metadata reads run on behalf of the simulated owner so owner-scoped reads resolve correctly.
- Static wallet shortfall diagnostics are preserved when failed simulation items prevent wallet delta readbacks.
- Raw plan simulations now override direct owner-to-spender ERC20 allowances in addition to Permit2 allowances.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
