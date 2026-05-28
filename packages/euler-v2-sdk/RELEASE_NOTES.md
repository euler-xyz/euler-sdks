# euler-v2-sdk v0.2.10-beta

## Summary

This beta release exposes an adaptive IRM rate-scaling helper so consumers can convert `rateAtTarget` (wad/second) to borrow SPY without duplicating the scaling constant.

## Highlights

- Added `adaptiveRateAtTargetToBorrowSPY(wadPerSecond)` and the exported `ADAPTIVE_RATE_AT_TARGET_TO_BORROW_SPY_SCALE` constant in `utils/irm`; returns `null` for negative inputs.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
