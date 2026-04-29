# Euler Lite Business Logic Parity Plan

The SDK goal is to provide enough Euler business logic that Euler Lite can be
rebuilt as a thin UI over SDK services. The SDK already has strong protocol and
data primitives, but several orchestration and policy layers still live in
Euler Lite composables.

## Current Gaps

### CoW support

Euler Lite contains CoW order building, app data, EIP-1271/inbox handling,
signing, submit/status handling, collateral-share conversion, wrapper support,
and quote-id forwarding. The SDK currently handles generic swap quotes and
execution plans, but not CoW order lifecycle logic.

### Repay and same-asset planners

Euler Lite supports detailed repay and same-asset flows:

- same-asset vault migration
- same-asset repay
- same-asset full repay
- same-asset debt migration
- savings-source repay
- savings-source full repay
- controller/collateral cleanup
- leftover redemption and residual share transfer

The SDK now has partial same-asset repay-from-deposit coverage plus same-asset
collateral and debt migration planners:

- `planRepayFromDeposit` handles same-vault `repayWithShares` and different-vault
  `withdraw -> skim -> repayWithShares` paths while preserving `fromAccount`.
- `planMigrateSameAssetCollateral` handles no-swap supplied/collateral movement
  with `withdraw` or `redeem`, `skim`, and optional collateral flag rotation.
- `planMigrateSameAssetDebt` handles full debt migration with a 0.01% interest
  cushion, new-controller enablement, old-vault `repayWithShares(max)`, old
  controller disablement, and optional excess sweep.

Remaining gaps are full-repay cleanup parity, savings-source variants, native
wrapping, operation guards, and lifecycle orchestration.

### Swap quote orchestration

Euler Lite fans out across providers, guards against stale quote races, estimates
gas per quote, ranks quotes by gas-adjusted value, tracks selected providers, and
surfaces provider-specific quote failures. The SDK validates quotes, but does not
yet expose this quote orchestration as reusable business logic.

### Slippage and price-impact policy

Euler Lite owns default slippage policy, stablecoin-specific defaults, local
override expiry, and price-impact confirmation thresholds. The SDK validates
slippage bounds in quotes, but does not provide the policy helpers needed by a
thin UI.

### Market discovery and labels metadata

Euler Lite groups markets/products, computes product-level metrics, handles
verified/unverified exposure, borrow-pair availability, featured vaults,
restricted/blocked/not-explorable labels, portfolio notices, earn metadata, and
escrow classification. The SDK has labels and vault services, but not the full
market discovery view model or label schema parity.

### Policy guards

Euler Lite contains geo/access guards, unverified vault guards, hook-disabled
operation checks, and plan-level blockers. The SDK exposes some raw inputs such
as vault hook data, but not a reusable pure guard layer.

### rEUL locks

The SDK rewards service covers Merkl, Brevis, and Fuul claim planning. Euler
Lite also reads rEUL lock state and builds unlock transactions, which is not yet
covered by SDK services.

### Portfolio parity

The SDK portfolio service is moving in the right direction with grouped savings
and borrows, totals, NAV, ROE/APY, and sub-account helpers. It still needs golden
tests against Lite behavior for classification, collateral usage, zero-value
filtering, Pyth-priced collateral, and verified/unverified toggles.

## Porting Plan

### Phase 0: parity harness

Create golden fixtures from Euler Lite for accounts, labels, quotes, and
transaction plans. SDK tests should compare decoded calldata and plan
descriptions instead of UI output.

### Phase 1: account and portfolio parity

Stabilize `PortfolioService`, port Lite's position classification and filtering
rules, expand label metadata, and add tests for borrow/savings grouping and
collateral attribution.

### Phase 2: transaction planner parity

Add or extend SDK planners for same-asset full repay, savings-source
repay/full repay, borrow-by-saving, native wrapping, and full-repay cleanup.
Same-asset collateral migration, same-asset debt migration, and
`planRepayFromDeposit` source-account propagation are covered by the execution
service.

#### Repay-from-deposit focus

Euler Lite distinguishes these same-underlying repay cases:

- source and debt are the same vault: `repayWithShares` from the source
  sub-account against the borrow sub-account
- source and debt are different vaults: withdraw source vault assets directly
  into the borrow vault, `skim`, then `repayWithShares`
- full repay: withdraw with interest cushion, repay max, disable controller and
  collateral, redeem leftovers, skim them back, and transfer residual shares

The SDK has examples for both same-vault and different-vault
`planRepayFromDeposit` paths. The different-vault partial path follows Lite's
approval-free sequence: `withdraw(..., borrowVault, sourceAccount)`, `skim`, and
`repayWithShares(amount - 1)`.

### Phase 3: quote orchestration service

Move provider fanout, selected-provider behavior, gas-adjusted ranking,
price-impact calculation, slippage defaults, quote freshness, and provider
metadata into SDK services.

### Phase 4: CoW service

Port order builder, app data, quote-id/provider-data handling, wrapper data,
EIP-1271/inbox signing path, order submission/status, collateral-share
conversion, and max-share protections.

### Phase 5: policy and guard service

Expose SDK validators for geo/label restrictions, unverified vault exposure,
vault hooks/paused operations, price impact, and plan-level blockers. UI should
render and acknowledge these states, not compute them.

### Phase 6: rEUL lock service

Read rEUL locks, expose unlockable state, and build unlock plans.

### Phase 7: example app dogfooding

Make the SDK example app consume SDK services for portfolio, markets, quotes,
plans, guards, and rewards. Any copied Lite business logic remaining after that
is a parity gap.
