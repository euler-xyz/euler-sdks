# euler-v2-sdk v0.2.16-beta

## Summary

This beta release improves oracle route decoding performance.

## Highlights

- Memoized oracle route adapter ABI decoding to avoid repeated decode work when resolving route steps.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
