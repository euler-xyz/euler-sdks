# Rewards Service

`rewardsService` owns reward reads and reward claim planning in the SDK.

It handles two separate concerns:

- reward discovery and account/vault reward reads through pluggable adapters
- reward-specific claim planning for Merkl, Brevis, and Fuul

`executionService` remains generic. It executes `TransactionPlan` items, but it does not know how to fetch reward proofs, Fuul claim checks, or provider-specific calldata.

## Read APIs

Use these methods for reward discovery and display:

- `fetchChainRewards(chainId)` for vault-level reward APR catalogs
- `fetchVaultRewards(chainId, vaultAddress)` for one vault
- `populateRewards(vaults)` to enrich vault entities
- `fetchUserRewards(chainId, address)` for claimable user rewards
- `fetchFuulTotals(address)` for Fuul claimed/unclaimed totals
- `fetchFuulClaimChecks(address)` for Fuul claim payloads

### Reward objects and viewer-aware filtering

`fetchVaultRewards` / `fetchChainRewards` (and the populated `vault.rewards`) return `VaultRewardInfo`, which holds the raw `campaigns: RewardCampaign[]` and exposes viewer-aware reads:

- `totalRewardsApr` (getter) — headline sum of all campaign APRs, no viewer. Same as `getTotalRewardsApr()`.
- `getActiveCampaigns({ viewer })` — campaigns the viewer is eligible for.
- `getTotalRewardsApr({ viewer })` — sums APR over eligible campaigns.

Eligibility is decided by `defaultIsActiveForViewer` (Merkl semantics): no viewer means eligible (so discovery surfaces keep showing the full APR to unconnected visitors); a non-empty campaign `whitelist` restricts eligibility to listed addresses (overriding the blacklist); otherwise `blacklist` membership disqualifies. Address comparison is case-insensitive, and `whitelist`/`blacklist` arrive already lowercased from both the direct and V3 adapters.

Override the predicate globally via `rewardsServiceConfig.isActiveForViewer`, or at runtime via `rewardsService.setIsActiveForViewer(fn)` / `getIsActiveForViewer()`. The service re-binds the active predicate onto every `VaultRewardInfo` it returns.

### Reward actions and yield attribution

`RewardCampaign.action` is one of `"LEND" | "BORROW" | "BORROW_COLLATERAL" | "LOOPING"`. Account/portfolio yield computations attribute these to positions as follows:

- `LEND` — added to a supplied position's reward APY.
- `BORROW` — added to a borrow position's reward APY.
- `BORROW_COLLATERAL` — added to a borrow's reward APY when the campaign's collateral matches a collateral in the position.
- `LOOPING` — applied when the position's leverage multiplier falls inside the campaign's `[minMultiplier, maxMultiplier]` window, contributing `equityUsd * loopingApr`.

On `Portfolio`, per-position, and sub-account views, the plain `netApy` / `roe` / `apyBreakdown` / `roeBreakdown` getters stay headline (no viewer), while the `getNetApy({ viewer })`, `getRoe({ viewer })`, `getApyBreakdown({ viewer })`, and `getRoeBreakdown({ viewer })` methods apply whitelist/blacklist eligibility so it flows through to net APY and ROE.

## Adapters

`rewardsService` now uses an internal read adapter:

- `v3` (default)
  - uses `GET /v3/apys/rewards` for vault reward APR catalogs
  - uses `GET /v3/rewards/breakdown` for per-account reward reads
  - normalizes both Brevis and Incentra provider labels to `brevis`
  - merges direct Brevis/Incentra campaign rows into the V3 campaign map, so V3-backed APY reads keep parity with the provider campaign surface
  - uses direct proof-backed Brevis/Incentra user rewards when V3 does not include all claim fields
  - Fuul helper reads that are not available in V3 are handled by `rewardsService` itself via the direct adapter
- `direct`
  - uses the Merkl, Brevis, and Fuul provider endpoints directly

This split makes V3 the default for both vault reward APR catalogs and per-user reward breakdowns, without coupling the V3 adapter to the direct adapter implementation.

`fetchUserRewards(...)` returns normalized `UserReward` objects with provider-specific claim metadata already attached:

- Merkl: `proof`, `claimAddress`
- Brevis/Incentra: `proof`, `claimAddress`, `cumulativeAmounts`, `epoch`
- Fuul: `claimAddress` for display; claim checks are resolved lazily when building the plan

Brevis/Incentra claim planning requires all four fields: `claimAddress`, `proof`, `cumulativeAmounts`, and `epoch`. The default V3 service path returns proof-backed direct rewards when V3 rows do not contain all claim metadata.

### Reward token resolution (V3)

`UserReward.token` is resolved from, in order:

1. Row-level token fields on the `/v3/rewards/breakdown` row (`token`, `rewardToken`, `rewardToken*`, `token*`).
2. The campaign's `rewardToken` from `/v3/apys/rewards`, matched by campaign id (and vault, when present).
3. The breakdown row's `rewardTokenMetadata`, which V3 resolves per row independently of whether the campaign is still listed by `/v3/apys/rewards`.

`rewardTokenMetadata` is only accepted when its `address` normalizes to the same address as the row's reward token, so a mismatched or malformed payload can never relabel a reward. The field is nullable and absent on older V3 responses; both cases are treated as "no metadata". Decimals are accepted only as an integer in `[0, 255]` (numeric strings included), matching the ERC-20 `uint8`: a fractional value such as `6.5` is a malformed payload, not a scale, and is left unresolved rather than truncated, and an out-of-range count is rejected before it can reach a formatter.

`UserRewardToken.decimals` is **optional**. When no source resolves it, the SDK omits it rather than assuming 18, because guessing 18 silently misreads every token that uses a different scale. Callers must handle `undefined` explicitly and must not fall back to a truthiness check (`decimals || 18` would also discard a valid `0`). `symbol` and `name` keep the existing convention of falling back to the token address when unresolved.

The direct Turtle path follows the same rule: the Merkle proof's own token wins, then the configured `turtleStreams` entry's `rewardToken.decimals` when — and only when — its address matches the token the proof pays out in; a stream reconfigured to a different token never lends its old scale. When the proof, the configured stream and the campaign all omit `decimals`, the reward is reported unresolved instead of defaulting to 18. Where both paths produce a row for the same stream and token, the rows are collapsed: the larger amount wins, but a resolved token is always preferred over an unresolved one, so the surviving amount is never scaled by nothing. The fallback adapter factory in `buildSDK` merges the V3 and direct rows before `RewardsService` sees them, so it shares the same reduction (`mergeTurtleUserRewards`) rather than repeating it.

Raw reward amounts (`accumulated`, `unclaimed`) and all claim/proof data are unaffected by token resolution — they stay unscaled regardless of whether metadata resolved.

## Claim Planning APIs

Use the claim builders when the user is about to submit a reward claim:

- `buildClaimPlan({ reward, account })`
- `buildClaimPlans({ rewards, account })`
- `buildClaimAllPlan({ chainId, account })`

These methods return a standard `TransactionPlan`, but they emit `contractCall` items instead of `evcBatch` items because reward claims are provider-specific contract calls, not Euler EVC operations.

## Provider Behavior

### Merkl

- Plans are grouped by `(chainId, claimAddress)`
- Multiple selected Merkl rewards on the same claim distributor are combined into one `claim(...)` call
- The planner uses `reward.accumulated` plus the stored Merkle proof data

### Brevis/Incentra

- Each reward becomes one direct `claim(...)` call
- The planner uses `cumulativeAmounts`, `epoch`, and `proof` from the reward payload

### Fuul

- Fuul claim checks are fetched at plan-build time
- The planner reads per-project native claim fees on-chain and sums them into the payable transaction `value`
- Selecting any Fuul reward currently produces one claim that covers all currently claimable Fuul checks for that account on that chain

## Execution Model

Reward plans run through the same execution service as core Euler plans:

1. build the reward plan in `rewardsService`
2. pass the returned `TransactionPlan` to `sdk.executionService.executeTransactionPlan(...)`
3. let the service execute `contractCall` items directly and `evcBatch` items through EVC
4. refetch account/vault reward queries after confirmation

References:

- [`execution-service.md`](./execution-service.md)
- [`examples/react-sdk-example/src/utils/txProgress.ts`](../examples/react-sdk-example/src/utils/txProgress.ts)

## Configuration

Relevant `rewardsServiceConfig` fields:

- `adapter`
- `directAdapterConfig`
- `v3AdapterConfig`
- `isActiveForViewer` (viewer-eligibility predicate; defaults to Merkl whitelist/blacklist semantics)
- `merklApiUrl`
- `brevisApiUrl`
- `brevisProofsApiUrl`
- `fuulApiUrl`
- `fuulTotalsUrl`
- `fuulClaimChecksUrl`
- `brevisChainIds`
- `merklDistributorAddress`
- `fuulManagerAddress`
- `fuulFactoryAddress`
- `turtleApiUrl`
- `turtleApiKey`
- `turtleStreams`
- `enableMerkl`, `enableBrevis`, `enableFuul`, `enableTurtle`

The top-level provider URL fields remain supported for backward compatibility. They are treated as `directAdapterConfig` inputs.

`turtleApiKey` (or `config.rewardsTurtleApiKey` / `EULER_SDK_REWARDS_TURTLE_API_KEY`) is sent as an `X-API-Key` header on direct Turtle requests. The Turtle Earn API rejects unauthenticated requests, so the direct and fallback adapters return no Turtle data without it. Credentialed Turtle requests are made with `redirect: "error"`, so the key is only ever sent to the configured `turtleApiUrl` origin; a redirecting upstream or proxy yields no Turtle data rather than a replayed key. Keep the key server-side; browser builds should route Turtle traffic through a proxy via `turtleApiUrl` or disable Turtle with `enableTurtle: false`.

Note that `enableTurtle: false` only stops Turtle campaign discovery and user-reward enumeration. `fetchTurtleProofs` still runs when a caller asks for explicit Turtle claim proofs, and the V3 and fallback adapters delegate that call to the direct adapter because V3 does not serve merkle proofs. A browser app that offers Turtle claims therefore still needs `turtleApiUrl` pointed at an authenticating proxy, while V3 and fallback deployments can return Turtle campaign data without a direct key.

For Fuul claim planning, the SDK also needs a configured `providerService` so it can read claim fees from the Fuul factory contract.
