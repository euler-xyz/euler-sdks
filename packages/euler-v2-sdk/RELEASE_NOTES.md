# euler-v2-sdk v0.2.14-beta

## Summary

This beta release reduces EVault oracle payload duplication and keeps Pyth feed collection route-scoped. EVaults now carry root oracle identity plus the selected asset and collateral routes, while adapter and resolved-vault projections are derived from route steps when needed.

## Highlights

- EVault root `oracle` data now contains only `oracle` and `name`; selected pricing data lives on `debtPricingOracleRoute` and `collaterals[].oracleRoute`.
- `OracleRoute` no longer stores duplicate `adapters` or `resolvedVaults`; use `getOracleRouteAdapters(route)` and `getOracleRouteResolvedVaults(route)` for derived views.
- Adapter route steps carry Pyth and Chainlink detail directly, avoiding nested `step.adapter` duplication.
- SDK Pyth plugin feed collection now reads `debtPricingOracleRoute` and per-collateral `oracleRoute` steps.
- Account portfolio computations report zero LTV for debt positions without enabled collateral.

## Validation

- `pnpm -C packages/euler-v2-sdk run release:check`
