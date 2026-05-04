# Changelog

## [0.1.3-beta] - 2026-05-04

### Added

- Added transaction plan execution helpers, operation groups, and split encode/execute/simulate internals.
- Added same-asset position migrations plus max-repay cleanup and savings-sourced planning examples.
- Added portfolio yield breakdown fields and expanded example app portfolio coverage.

### Changed

- Merged simulation capabilities into the execution service and refreshed execution examples/docs around the new flow.
- Updated V3 defaults, pricing configuration, and vault/account parity scripts.

### Fixed

- Paginated V3 account position reads so heavy accounts are no longer capped by the endpoint default page size.
- Hardened user reward valuation against malformed V3 reward price and decimal fields.
- Fixed keyring plugin batch prepending for transaction plan preparation.
- Fixed release dry-run packaging so PR validation works with the pnpm version used in CI.

## [0.1.2-beta] - 2026-04-29

### Added

- Added portfolio entities and account-level portfolio/yield computed properties.
- Added transaction plan gas estimation plus swap-from-wallet and USDT reset-approval examples.
- Expanded read-path, portfolio, swap, and simulation service test coverage with generated mainnet fixtures.

### Changed

- Improved React example portfolio parity, raw JSON inspection, query options, and V3 endpoint configuration.
- Updated V3 label and resolved-oracle handling for vault reads.

### Fixed

- Fixed repay-from-deposit source-account handling, USDT approval reset behavior, and swap verifier/slippage validation checks.

## [0.1.1-beta] - 2026-04-17

### Added

- Initial release 🎉
