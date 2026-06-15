# Changelog

## [1.0.5] - 2026-06-15

### Fixed

- Fixed simulation readbacks for Securitize collateral vaults so vault entities are stitched from ERC4626, governor, and resolved supply-cap reads.
- Fixed Securitize simulation readbacks to run vault metadata reads on behalf of the simulated owner.
- Preserved static wallet shortfall diagnostics when failed simulation items prevent wallet delta readbacks.
- Added direct owner-to-spender ERC20 allowance overrides alongside Permit2 allowance overrides for raw plan simulations.

## [1.0.4] - 2026-06-15

### Added

- Added reward stream reads on account positions and reward stream claim plan generation through the rewards service.
- Added wallet balance metadata to contract calls and EVC batch operations so simulation layers can track claim, rEUL unlock, and cleanup balance changes.
- Added a native balance accessor on `Wallet`.

### Changed

- Simulations now stitch batched operation state through wallet, account, cleanup, and reward-claim readbacks.
- rEUL unlock plans now use EVC batch operations and track resulting EUL wallet balances.

### Fixed

- Fixed approval and balance override fallback handling when access-list discovery is unavailable.
- Fixed simulation balance requirements so multiple operations that need the same token are summed before wallet checks.
- Fixed cleanup-state reads in simulations so post-operation state is fetched consistently.
- Normalized direct `Account` construction so sub-account map keys use checksum addresses.

## [1.0.3] - 2026-06-10

### Added

- Added token category tags to token list entries so SDK consumers can use V3 token metadata classifications.

### Changed

- Token list service preserves string `tags` from API responses while filtering out non-string tag values.

### Tests

- Added read-path coverage for token tags across full token list loads and paginated token list queries.

## [1.0.2] - 2026-06-05

### Added

- Added tag-based Euler label classification support for products, vault overrides, and Earn labels.
- Added helpers for recently-added, governance-limited, high-utilisation warning suppression, and cyclical-note classifications.

### Changed

- Populated vault labels now preserve vault override tags so SDK consumers receive the same classifications exposed by raw labels data.
- Updated SDK docs, examples, and tests for the tag-based labels shape.

## [1.0.1] - 2026-06-03

### Fixed

- Restored Fuul user reward reads through Fuul's public claimable-rewards endpoint when caller-hosted Fuul totals or claim-check URLs are not configured.
- Preserved existing Fuul override URL behavior and passed claim-chain context through claim verification for direct-adapter Fuul claims.

## [1.0.0] - 2026-06-03

### Changed

- Published the Euler V2 SDK as a stable 1.0.0 release.

## [0.2.16-beta] - 2026-06-03

### Changed

- Oracle route adapter ABI decoding is memoized to avoid repeated decode work when resolving route steps.

## [0.2.15-beta] - 2026-06-03

### Changed

- Updated the SDK runtime `viem` dependency to `2.48.8` to match the app dependency version.

## [0.2.14-beta] - 2026-06-02

### Changed

- EVault oracle data now serializes only the selected asset and collateral `OracleRoute` data; root oracle internals and derived adapter/resolved-vault projections are no longer duplicated on EVault payloads.
- Pyth feed collection now derives feeds from `debtPricingOracleRoute` and per-collateral `oracleRoute` steps.

### Fixed

- Account portfolio computations now report zero LTV for debt positions without enabled collateral.

## [0.2.12-beta] - 2026-05-29

### Fixed

- Pyth plugin quote prefetch now caches empty results (returns `{ entries: [] }` instead of `undefined`) and collects feeds from controllers, so fan-out flows don't re-fetch Hermes for vaults with no Pyth feeds.

## [0.2.11-beta] - 2026-05-28

### Changed

- **Breaking:** `EulerLabelProduct` and `EulerLabelVaultOverride` now carry a freeform `tags: string[]` array instead of a boolean `keyring` field. Keyring classification is derived from the `"keyring"` tag.

### Added

- Added `isEulerLabelVaultAccessControlled` (tag `"access control"`); `isEulerLabelVaultKeyring` / `isEulerLabelProductKeyring` now resolve the `"keyring"` tag.

## [0.2.10-beta] - 2026-05-28

### Added

- Exposed `adaptiveRateAtTargetToBorrowSPY` helper and `ADAPTIVE_RATE_AT_TARGET_TO_BORROW_SPY_SCALE` constant for scaling adaptive IRM `rateAtTarget` (wad/second) to borrow SPY.

## [0.2.9-beta] - 2026-05-28

### Added

- Added pairwise oracle route decoding: `EVault.debtRoute` / `collateralRoute` expose ordered route steps for both onchain and V3 adapters, with oracle utilities for decoding raw lens route data.

### Changed

- CoW close-position full-repay buy amount now uses the standard `adjustForInterest` cushion shared with approvals, verifier amounts, and same-asset repay (instead of a separate 1/100_000 pad) so the order reliably covers debt that accrues between quote and settlement.
- Portfolio borrow collaterals are returned ordered by oracle value (descending).

### Fixed

- `getMaxMultiplier` now applies the safety margin to the multiplier itself (`1 / (1 - borrowLtv) - safetyMargin`) instead of shifting the LTV input, avoiding sharp drops near high LTVs.
- CoW swap quote validation flow corrected (swapper/verifier checks).

## [0.2.8-beta] - 2026-05-26

### Added

- Added plugin prefetch support for fan-out simulation and quote flows, including `executionService.prefetchPluginDataForPlan`, `PluginPrefetchData`, and Pyth/Keyring plugin prefetch handling.
- Added `SimulationStateOverrideOptions` performance controls, wallet snapshots, ERC20 slot-hint helpers, and the `simulate-with-prefetch-and-slot-hints` example.
- Added viewer-aware rewards filtering through `VaultRewardInfo`, `ViewerOptions`, and configurable `isActiveForViewer` predicates.
- Added borrow-side reward attribution for `BORROW_COLLATERAL` and `LOOPING` campaigns in account, portfolio, and ROE calculations.
- Added `accountService.resolveNewSubAccount` for borrow flows that need a live stale-controller check before selecting a free sub-account.

### Changed

- Pyth plugin reads now support a custom Hermes `fetchFn`, route-aware feed collection, and prefetched update batches.
- Execution planners expose `skipCleanup` controls where callers need to manage cleanup explicitly.
- React example portfolio, rewards, vault list, and query flows now use the updated rewards and simulation surfaces.

### Fixed

- Borrow planners now avoid stale sub-account state before building borrow plans.
- Approval resolution skips Permit2 when an existing direct vault allowance already covers the required amount.
- Euler Earn one-hour supply APY and V3 rewards adapter parsing now match current V3 reward payloads.

## [0.2.4-beta] - 2026-05-19

### Added

- Added `TransactionPlanPrepared` envelope and `ExecutionService.prepareTransactionPlan` so consumers can run plugins + required-approval resolution once and reuse the result across simulate and execute.
- Added `ExecutionService.simulatePreparedTransactionPlan` and `ExecutionService.executePreparedTransactionPlan` that consume the envelope and skip the internal plugin pipeline (and, for execute, the approval re-resolution).
- Added `isPreparedTransactionPlan` type guard.

### Fixed

- `ExecutionService.resolveRequiredApprovals` now short-circuits when the plan has no `requiredApproval` items, avoiding an unnecessary `walletService.fetchWallet` call on withdraw/redeem flows.
- `deriveStateOverrides` skips the provider lookup and per-token balance/allowance reads when the plan has no balance or approval requirements, emitting only the synthetic native-balance override.

## [0.2.3-beta] - 2026-05-15

### Changed

- Restored account and portfolio USD-value property names while keeping market-value semantics available for SDK consumers.
- Improved optional V3 diagnostic parsing for account, EVault, and Euler Earn read paths.
- Updated SDK UI data-layer guidance for market-price and USD-value fields.

### Fixed

- Fixed Euler Earn label lookup behavior.
- Added regression coverage for optional V3 diagnostics, parsing, Earn labels, and account portfolio value fields.

## [0.2.2-beta] - 2026-05-13

### Added

- Added the React example bad debt explorer.
- Added asset-denominated redeem planning support.
- Added rewards parity metadata and ISO timestamp support for V3 collateral targets.

### Changed

- Moved tokenlist reads to the V3 tokenlist endpoint and filtered defaults to base tokens.
- Improved SDK query cache keys and external data query caching docs.
- Updated SDK defaults and examples for the Euler Finance V3 endpoint.

### Fixed

- Fixed debt planning cleanup behavior.
- Hardened reward and Pyth claim targets plus exact-out swap quote handling.
- Fixed resolved vault metadata handling.

## [0.2.1-beta] - 2026-05-11

### Added

- Added planner APIs and examples for wallet swap + borrow, wallet swap + repay, withdraw + swap, redeem + swap, and same-asset multiply flows.
- Added InCentra rewards parity support across rewards adapters, account reward totals, docs, examples, and tests.

### Changed

- Centralized swap quote verifier/slippage validation and aligned execution planners with the correct verifier modes.
- Updated execution and swap docs, SDK skill guidance, and the example runner so every transaction plan path has a runnable example.

### Fixed

- Hardened wallet-sourced repay planning around router sweep context and exact-input quote execution.
- Refreshed same-asset migration and multiply examples to work against current live vault configuration and quote providers.

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
