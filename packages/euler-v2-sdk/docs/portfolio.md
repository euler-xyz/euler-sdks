# Portfolio

`Portfolio` is the high-level account abstraction for position-first portfolio views. It is built on top of an `Account`, hides the sub-account structure, and exposes savings and borrows as top-level concepts.

`Account` and `Portfolio` are two views over the same underlying data. Use `Account` when you need the lower-level, contract-shaped data model: owners, sub-accounts, raw positions, enabled controllers, enabled collaterals, and liquidity structs. Use `Portfolio` when you need an opinionated, position-first view across the whole account.

## Fetching

```typescript
const { result: portfolio, errors } = await sdk.portfolioService.fetchPortfolio(chainId, owner)
```

`Portfolio` requires its backing account to be fully populated. `portfolioService.fetchPortfolio` always calls `accountService.fetchAccount` with `populateAll: true`, so vault entities, market prices, user rewards, and vault enrichments are loaded before the Portfolio is constructed.

You can also construct one from an already populated account:

```typescript
const { result: account } = await sdk.accountService.fetchAccount(chainId, owner, {
  populateAll: true,
})

const portfolio = sdk.portfolioService.buildPortfolio(account)
```

## Shape

```typescript
portfolio.savings
// Array<{
//   position: AccountPosition
//   vault?: VaultEntity
//   subAccount: Address
//   shares: bigint
//   assets: bigint
//   suppliedValueUsd?: bigint
// }>

portfolio.borrows
// Array<{
//   borrow: AccountPosition
//   collaterals: AccountPosition[]
//   collateral?: AccountPosition
//   borrowVault?: VaultEntity
//   collateralVault?: VaultEntity
//   subAccount: Address
//   healthFactor?: bigint
//   userLTV?: bigint
//   borrowed: bigint
//   supplied: bigint
//   borrowLTV?: number
//   liquidationLTV?: number
// }>
```

Savings are supplied positions that are not actively supporting debt in the same sub-account. Borrows are debt positions plus their collateral positions. The raw `AccountPosition` references are preserved, so callers can still drill into lower-level account data when needed.

## Computed Metrics

Portfolio-level metrics are computed from the current account positions:

- `totalSuppliedValueUsd`
- `totalBorrowedValueUsd`
- `netAssetValueUsd`
- `netApy`
- `roe`
- `totalRewardsValueUsd`

The portfolio stores an account reference, not a copied snapshot. If the account is re-populated or its positions are updated, subsequent Portfolio computed-property reads reflect the new account state.

`totalRewardsValueUsd` delegates to `account.totalRewardsValueUsd`, since user rewards are still account-scoped.

## Sub-account Selection

Portfolio can select sub-accounts for new positions from the same filtered position view used by its savings, borrows, and metrics:

```typescript
const nextSubAccount = portfolio.getNextSubAccount()
const nextBorrowSubAccount = portfolio.getNextSubAccount({ borrowVault })
const freeSubAccounts = portfolio.getFreeSubAccounts()
```

When `borrowVault` is provided, candidates with known enabled controllers are only returned if their controllers already match that vault. Use the matching `Account` helpers when you want the same selection logic over the complete lower-level account tree instead of the portfolio-filtered view.

## Position Filtering

A portfolio can permanently filter positions at construction time. The filter is applied consistently to savings, borrows, totals, net APY, and ROE.

```typescript
const { result: portfolio } = await sdk.portfolioService.fetchPortfolio(chainId, owner, {
  positionFilter: (position, { account }) => {
    return position.assets > 0n || position.borrowed > 0n
  },
})
```

The predicate receives the `AccountPosition` and the backing `Account` for context:

```typescript
const portfolio = sdk.portfolioService.buildPortfolio(account, {
  positionFilter: (position, { account }) => {
    return account.owner === owner && position.vaultAddress !== ignoredVault
  },
})
```
