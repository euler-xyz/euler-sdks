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

## Adapters

`rewardsService` now uses an internal read adapter:

- `v3` (default)
  - uses `GET /v3/apys/rewards` for vault reward APR catalogs
  - uses `GET /v3/rewards/breakdown` for per-account reward reads
  - Fuul helper reads that are not available in V3 are handled by `rewardsService` itself via the direct adapter
- `direct`
  - uses the legacy Merkl, Brevis, and Fuul provider endpoints directly

This split makes V3 the default for both vault reward APR catalogs and per-user reward breakdowns, without coupling the V3 adapter to the direct adapter implementation.

`fetchUserRewards(...)` returns normalized `UserReward` objects with provider-specific claim metadata already attached:

- Merkl: `proof`, `claimAddress`
- Brevis: `proof`, `claimAddress`, `cumulativeAmounts`, `epoch`
- Fuul: `claimAddress` for display; claim checks are resolved lazily when building the plan

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

### Brevis

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
- `merklApiUrl`
- `brevisApiUrl`
- `brevisProofsApiUrl`
- `fuulApiUrl`
- `fuulTotalsUrl`
- `fuulClaimChecksUrl`
- `merklDistributorAddress`
- `fuulManagerAddress`
- `fuulFactoryAddress`

The top-level provider URL fields remain supported for backward compatibility. They are treated as `directAdapterConfig` inputs.

For Fuul claim planning, the SDK also needs a configured `providerService` so it can read claim fees from the Fuul factory contract.
