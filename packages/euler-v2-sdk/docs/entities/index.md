# Entity Reference

This section documents the public entity shapes exported from `src/entities`.
Each page lists the data properties, populated fields, computed getters, and
entity methods for one entity module.

- [Account](./account.md)
- [ERC4626Vault](./erc4626-vault.md)
- [EVault](./evault.md)
- [EulerEarn](./euler-earn.md)
- [EulerLabels](./euler-labels.md)
- [Portfolio](./portfolio.md)
- [SecuritizeCollateralVault](./securitize-collateral-vault.md)
- [Wallet](./wallet.md)

## Shared Conventions

- `Address` is a checksummed EVM address from `viem`.
- Raw token amounts, shares, caps, and oracle values are `bigint` values in the
  token or protocol unit used by the source contract.
- APY, fee, utilization, and LTV fields stored as `number` are decimal
  percentages or ratios as documented on the owning page.
- Optional fields are only present when the source data includes them or after
  the matching population method has run.
- `populated` flags describe which enrichment steps have been applied to a
  mutable entity instance.

