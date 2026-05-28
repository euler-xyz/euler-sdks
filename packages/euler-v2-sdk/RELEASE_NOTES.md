# euler-v2-sdk v0.2.9-beta

## Summary

This beta release exposes pairwise oracle route data on `EVault`, corrects the CoW close-position full-repay padding to use the shared interest cushion, fixes the max-multiplier formula near high LTVs, and orders portfolio borrow collaterals by oracle value.

## Highlights

- `EVault.debtRoute` and `EVault.collateralRoute` carry ordered route steps decoded from raw lens oracle data, populated by both the onchain and V3 adapters; new oracle utilities and onchain parity coverage back the decoding.
- CoW close-position full-repay buy amount now flows through `adjustForInterest`, matching the cushion used by approvals, verifier amounts, and same-asset repay so the order still covers debt after interest accrues between quote and settlement (~900s window).
- `getMaxMultiplier` reworked to deduct the safety margin from the multiplier itself (`1 / (1 - borrowLtv) - safetyMargin`) instead of from the LTV input, avoiding sharp drop-offs near high LTV.
- Portfolio borrow collaterals are now returned ordered by oracle value (descending).
- CoW swap quote validation surface tightened.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
