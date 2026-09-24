# Infrastructure findings rechecked against original source

Rechecked 2026-09-23. Original SDK means commit `ff224741c251cae7673c5f835dcf3bbccd9d6605`, read using `git show`, not the uncommitted corrections. References below use **original-source line numbers**. EVC is `838e5f72eaea25fab7d242760245244226096054`; EVK periphery is `816c5943e5fab3a213e907dd5beaf9542305593a`. Full source identities are in [sources.json](../sources.json). These SDK utility findings do not imply defects in EVC or EVK.

## I01 — An old request can replace newer cached data

**Verdict: confirmed SDK cache race.** [Original buildQuery.ts:153–186](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/buildQuery.ts#L153) expires a pending entry from its start time. The successful completion always calls `cache.set`, whereas the rejection branch already checks promise ownership.

Example: A starts at time 0 with TTL 100; B starts at 101 because A expired. B returns a newer snapshot at 102. A returns its older snapshot at 103 and replaces B, giving the old data a fresh TTL. A's own caller receiving A is expected; subsequent callers receiving A instead of completed B is the bug. Slow API/RPC reads and the normal enabled cache suffice; no malformed contract response is required. The practical effect is temporarily stale balance, price, or configuration data, not an onchain state change.

The local fix requires the completing promise still to own the cache entry. The regression explicitly controls the two completion times and proves the next lookup returns B. EVC/EVK are not involved in cache ownership, so citing their accounting code as evidence here would be misleading.

## I02 — A configured request queue can stop making progress

**Verdict: confirmed utility bugs, with limited built-in reachability.** [Original callBundler.ts:75–108](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/callBundler.ts#L75) reschedules a nonempty queue even while every concurrency slot is occupied. With `debounceMs:0`, this repeatedly queues microtasks. A pending network/timer completion cannot free a slot because the microtask queue never empties. Two calls, batch size one and concurrency one are sufficient.

A separate path invokes `batchFn(keys)` outside a promise rejection boundary. A synchronous throw leaves removed queue entries unsettled and its active-slot count unreleased. Although the declared return type is a promise, a non-async function may throw before returning one.

The utility is exported from the package. The inspected built-in callers use its default 5 ms debounce and async callbacks: **the zero-debounce starvation and synchronous-throw scenarios are not established in the normal built-in configuration**. They matter to applications using the exported utility/custom settings. The correction resumes queued work on capacity release and catches invocation failures. Queue and recovery regressions pass. No EVC/EVK behavior is implicated.

## I03 — Invalid sizes and an aggregate helper that cannot join chunks

**Verdict: mixed; invalid-input hardening plus a confirmed exported-helper limitation.** [Original callBundler.ts:33–46 and 58–65](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/callBundler.ts#L33) accepts finite `maxBatchSize` in `createBundledCall`, but that helper returns only `results[0]`. For input `[a,b]`, size one, and a batch callback returning its input, both chunks run but the public result is only `[a]`. The helper cannot generically combine arbitrary result type V. It is exported, but no production SDK call site uses it.

Zero, NaN, or sub-unit batch sizes can prevent the underlying queue from dispatching. Separately, [original reulLockService.ts:68–100](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/reulLockService/reulLockService.ts#L68) increments its lock loop by user-supplied `batchSize`; zero never advances if at least one timestamp exists. This is not a normal default-size failure or a defect in the rEUL contract. Local validation rejects unsupported sizes before reads; the aggregate helper rejects finite chunking rather than silently returning a partial result. These are grouped related cases, not one production vulnerability.

## I04 — A successful lens result does not prove preceding updates succeeded

**Verdict: confirmed read-enrichment reliability bug; missing-result checks are additional hardening.** [Original batchSimulation.ts:119–136](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/batchSimulation.ts#L119) inspects only the final lens result. In [actual EVC:632–648](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L632), simulation deliberately records each failure and continues to later calls. Ordinary `batch` instead reverts on the first failure at lines600–613.

An oracle update can fail while a lens call succeeds using preexisting prices or returning its own best-effort result. The old helper presented that value as the successfully enriched read, losing the update failure. This does not make an invalid transaction executable and does not always make the lens value wrong: existing prices may still be valid. The error is hiding that the requested prerequisite was not applied.

The correction checks every prepend and the exact result count. The actual EVC allocates exactly one result per item, so count mismatch requires an incompatible/misconfigured source and is defensive validation. A new fourth Solidity fixture test runs the real EVC: failed update, successful read returning42, and ordinary batch reverting on the same calls. The TypeScript regression then verifies that the SDK rejects that successful-final-read shape as enrichment failure. Adapter fallback diagnostics are covered by D13.

## I05 — EVC-only Pyth preparation

**Verdict: duplicate of E09, not an additional finding.** Pyth previously relied on incomplete health-check discovery. Its call site now passes the configured EVC address, so real EVC collateral/controller mutations are interpreted with their proper destination. See [execution recheck](execution.md) for contract checks, actual EVC regression, and the distinction between a controller address and the account argument. Do not count this again as a separate bug.

## I06 — Pyth fee cache collapses different argument arrays

**Verdict: confirmed cache-key collision; current production fee impact not established.** [Original pythPlugin.ts:261–274](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/pyth/pythPlugin.ts#L261) normalizes `updateData` as a set. `[blob]` and `[blob,blob]` therefore share a cache key even though the RPC receives different arrays.

The external dependency was checked directly: [Pyth.sol at 2e6b859:95–120](https://github.com/pyth-network/pyth-crosschain/blob/2e6b859a331158b75468a2290e077da6f4b23175/target_chains/ethereum/contracts/contracts/pyth/Pyth.sol#L95) counts messages in **each array entry**, including repeated blobs. Lines634–638 calculate `count * perUpdateFee + transactionFee`; lines64–78 enforce the calculated fee. Thus differing multiplicity matters on a deployment with a nonzero per-update fee. A mock charging array length was evidence of key mismatch, not an exact implementation of Pyth's message-based fee.

Two further conditions matter: the default Hermes response would need differing duplicate multiplicities for identical blob contents, or the application would need to supply/override such data; no such normal Hermes response was demonstrated. Also [Pyth's current fee documentation](https://docs.pyth.network/price-feeds/core/current-fees), retrieved2026-09-23, says supported mainnet Core fees are zero. No current insufficient-fee incident follows from the cache collision alone. Retaining the full input array is still the correct cache fix. Treat the claim as conditional integration correctness, not a demonstrated live fee failure.

## I07 — Keyring preparation hides failures and trusts mismatched credentials

**Verdict: confirmed loss of failure information, plus defensive validation of trusted callback output.** [Original keyringPlugin.ts:340–359](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/keyring/keyringPlugin.ts#L340) records a failed gate read as `null`, indistinguishable from “not gated”. Lines402–417 then skip those prefetched targets. Lines421–467 catch credential-read/callback/encoding failures and return the incomplete plan. Credential insertion at448–465 does not bind returned trader, chain and policy to the requested values.

The relevant authority is [HookTargetAccessControlKeyring.sol:99–152](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/HookTarget/HookTargetAccessControlKeyring.sol#L99), which checks the EVC owner and policy onchain and reverts unauthorized interactions. The actual result of missing/wrong credentials is generally a later revert, not bypassed access control. Privileged/wildcard roles can independently permit calls. **The earlier suggestion that an ordinary failing batch pays for an irrelevant credential was too broad:** EVC batch rollback also rolls back prior calls/value transfers. No specific successful irrelevant-credential fee scenario was demonstrated.

The local patch fails preparation explicitly and checks returned identity/numeric values. This changes the previous best-effort behavior; a callback returning `null` remains an intentional opt-out. It does not prove an external credential signature valid, eliminate all missing-vault metadata, or supersede contract authorization. The failure/identity regressions pass. Numeric validation is hardening of an application-supplied callback, not an independently established exploit.

## I08 — disableV3 does not disable all built-in V3 requests

**Verdict: confirmed documented configuration mismatch.** [Original config.ts:13–17](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/sdk/config.ts#L13) promises that built-in V3 HTTP adapters are disabled and V3-only services report unavailable. But original buildSDK.ts1147–1162,1210–1218 and1446–1473 still construct the built-in tokenlist, backend-assisted price service and intrinsic APY adapter without that restriction.

An application choosing RPC-only fallback or intentionally disconnecting V3 still made V3 requests and inherited its failures. This is availability/configuration behavior, not a protocol solvency defect. The local change removes the built-in backend from pricing, exposes unavailable capability for V3-only sources, and preserves explicit service overrides and custom tokenlist URL functions/templates. Tests check that the disabled built-ins perform no fetch and that custom sources remain usable. EVC/EVK cannot enforce an SDK HTTP preference.

## I09 — Old enrichment survives removal; chain-specific labels can cross chains

**Verdict: confirmed SDK enrichment bugs.** [Original intrinsicApyService.ts:79–88](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/intrinsicApyService/intrinsicApyService.ts#L79) and [eulerLabelsService.ts:506–533](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/eulerLabelsService/eulerLabelsService.ts#L506) only assign when fresh data exists. Reusing an entity after the source removes its APY or labels leaves the old fields attached while marking population complete. A successful empty refresh is distinct from a thrown request; the fix does not erase existing values on an exception.

Additionally, labels population reads `vaults[0].chainId` once at426–427 and uses that map for every vault. Identical addresses on different chains can receive the first chain's label. The API accepts an array of entities carrying their chain IDs; no same-chain parameter constrains it. The local change groups by chain and clears absent successful-refresh values. Tests exercise both cases. Labels/APY are advisory display data; a wrong label does not change contract permissions or turn the displayed APY into an earned return.

## I10 — A zero wallet balance can conceal a failed token read

**Verdict: confirmed diagnostics gap; upstream best-effort behavior is intentional.** [UtilsLens.sol:177–192](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/UtilsLens.sol#L177) catches a token's reverting `balanceOf` and returns zero. [Original walletOnchainAdapter.ts:316–383](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/walletService/adapters/walletOnchainAdapter.ts#L316) attaches a warning only if the outer lens query rejects, so this inner token failure looks like a clean zero balance.

A paused/nonstandard/broken token read can therefore hide a wallet asset without a diagnostic. The patch verifies zero results with a direct token read and emits an issue on failure. It keeps valid zero balances clean and imposes an extra RPC read for zero values. Separate calls can observe different blocks, so this is improved failure visibility, not a coherent snapshot proof. No issue with EVC/EVK transfer authorization is claimed.

## I11 — Fallback loses an undefined rejection and misses failure telemetry

**Verdict: confirmed exported utility edge cases, low direct impact.** [Original fallbackAdapter.ts:155–186](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/fallbackAdapter.ts#L155) records the thrown value and decides that a throw happened only if it is not `undefined`. JavaScript permits `throw undefined`/`Promise.reject()`; those return an undefined result without invoking fallback. Normal built-in Error rejections are unaffected.

The same file promises a notification even if secondary completion fails (lines55–59), but calls it only after `await secondary` succeeds at197–202. Thus the most severe two-source failures miss telemetry. A boolean throw flag and `finally` callback correct both paths; the original secondary error still propagates and telemetry exceptions cannot replace it. The regression checks real callback counts and the propagated failure. This is data availability/observability, not an onchain exploit.

## Fresh verification

`pnpm exec vitest run test/integrationInfraRegression.test.ts test/pluginIntegrationRegression.test.ts test/keyringPlugin.test.ts test/pythPlugin.test.ts test/sdkConfig.test.ts` in the SDK package: **69 tests passed in5 files**, no type errors. The actual EVC fixture now has **4 passing Solidity tests**. A separate initial command accidentally selected the full suite under the restricted sandbox; six network/local-server tests failed with DNS/permission errors. Those failures are recorded rather than counted as a clean full-suite run. Final combined validation is recorded by the recheck index.
