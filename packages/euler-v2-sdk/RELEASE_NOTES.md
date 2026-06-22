# euler-v2-sdk v1.0.7

## Summary

This release fixes V3 reward source normalization so SDK consumers receive Accountable-backed Merkl reward rows as normal Merkl campaigns.

## Highlights

- V3 reward rows prefer `source` over attribution-style `provider` metadata when deriving SDK reward source.
- Flat and nested APY rows shaped as `provider: VALOS`, `source: merkl` normalize to Merkl LEND campaigns.
- Unknown source values still fall back to supported provider values.
- Unsupported Turtle APY rows remain filtered out.

## Validation

- `pnpm --filter @eulerxyz/euler-v2-sdk test -- rewardsService.test.ts`
- `pnpm --filter @eulerxyz/euler-v2-sdk typecheck`
- `pnpm --filter @eulerxyz/euler-v2-sdk build`
- `pnpm --filter @eulerxyz/euler-v2-sdk test`
- `pnpm -C packages/euler-v2-sdk run release:check`
