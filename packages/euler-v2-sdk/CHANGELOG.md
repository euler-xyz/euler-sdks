# Changelog

## [0.2.0-beta] - 2026-05-07

### Added

- Added execution plugin processing for simulation, gas estimation, and execution, including generic health-check sets for Pyth and Keyring flows.
- Added vault computed properties, Securitize collateral-vault exports, vault source metadata, and portfolio fields used by Lite position displays.
- Added normalized Euler labels selectors, oracle adapter metadata helpers, and read-path coverage for label and vault metadata behavior.
- Added owner-reference diagnostic locations across SDK services, entities, generated fixtures, parity scripts, and the React example diagnostic index.
- Added SDK-owned runtime configuration through partial `buildEulerSDK({ config })`, `EULER_SDK_*` env vars, and defaults, including `EULER_SDK_RPC_URL_<chainId>` RPC resolution.
- Added native wallet balance reads, batched token balance reads, optional allowance spenders, Permit2 nonce metadata, wallet-service docs, and a wallet example.
- Added `docs/config-through-env.md` as the complete reference for env/config-driven SDK settings.

### Changed

- Routed SDK configurable params through the resolution order `config`, explicit SDK option, `EULER_SDK_*` env var, then default; examples now rely on env/config for RPC URLs instead of standalone `rpcURLs` options.
- Renamed pricing backend configuration to pricing service configuration and threaded the V3 API key consistently through pricing and V3 adapters.
- Improved Lite migration support by exposing SDK serialization helpers, vault guards, vault source metadata, resolved oracle unwrap routes, and percentage-unit portfolio APY/ROE fields.
- Reworked diagnostics from path-based mapping to owner references plus concrete locations, with updated docs, fixtures, tests, and React example rendering.
- Exposed SDK market price, USD value, rewards value, and multiplier fields as plain numbers while keeping direct oracle and risk values as bigint.
- Updated multiplier computation to use supplied collateral USD value over equity and return a plain number.
- Updated React and script examples, pricing docs, portfolio docs, configuration docs, wallet docs, and SDK skill guidance for the release surface.
- Refreshed generated fixtures, parity scripts, and health-check imports for the updated read paths.

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
