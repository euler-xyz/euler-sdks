# euler-v2-sdk v0.1.3-beta

## Summary

This beta release fixes two V3 read-path edge cases that affected account and portfolio screens.

## Fixes

- V3 account positions now paginate through `/v3/accounts/:address/positions` instead of relying on the endpoint default page size.
- User reward USD totals now skip malformed reward price/decimal values instead of throwing during aggregate portfolio rendering.

## Validation

- `pnpm -C packages/euler-v2-sdk test -- readPathServices.test.ts accountLiquidityCollaterals.test.ts`
- `pnpm -C packages/euler-v2-sdk run typecheck`
