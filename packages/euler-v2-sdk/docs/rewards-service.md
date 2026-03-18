# Rewards Service

`rewardsService` owns reward-provider integrations in the SDK.

It handles two separate concerns:

- reward discovery and account/vault reward reads
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

Reward plans run through the same app executor as core Euler plans:

1. build the reward plan in `rewardsService`
2. pass the returned `TransactionPlan` to your executor
3. execute `contractCall` items directly and `evcBatch` items through EVC
4. refetch account/vault reward queries after confirmation

Reference executors:

- [`examples/utils/executor.ts`](../examples/utils/executor.ts)
- [`examples/react-sdk-example/src/utils/txExecutor.ts`](../examples/react-sdk-example/src/utils/txExecutor.ts)

## Configuration

Relevant `rewardsServiceConfig` fields:

- `merklApiUrl`
- `brevisApiUrl`
- `brevisProofsApiUrl`
- `fuulApiUrl`
- `fuulTotalsUrl`
- `fuulClaimChecksUrl`
- `merklDistributorAddress`
- `fuulManagerAddress`
- `fuulFactoryAddress`

For Fuul claim planning, the SDK also needs a configured `providerService` so it can read claim fees from the Fuul factory contract.
