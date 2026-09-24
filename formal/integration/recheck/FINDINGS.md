# Complete finding-by-finding source recheck

Rechecked 2026-09-23 against original SDK main `ff224741c251cae7673c5f835dcf3bbccd9d6605` and the exact upstream revisions in [sources.json](../sources.json). The original source was read separately from the local corrections. Reviewers rotated areas so that execution, data and migration/rewards findings were challenged by someone other than their initial reviewer. All work remains local and uncommitted.

The findings are **not all equivalent**. A confirmed SDK bug means a concrete incorrect code path is established for its stated conditions. It does not mean a live exploit or deployed incident has been demonstrated. Some entries are custom-configuration defects, defensive validation, compatibility improvements, or overlapping descriptions of the same root cause. EVC/EVK enforce their own transaction constraints independently of SDK displays and preparation.

## Corrections to the earlier account

1. **The Earn withdrawal example was attributed to the wrong version.** Original main inherited a 1:1 `previewWithdraw`, so a yield-accrued Earn vault could redeem too many shares/assets or revert. The 1,000,000 requested →966,942 received example belongs to an intermediate local snapshot-conversion change that omitted pending fee shares. The current exact `withdraw(assets)` planning change avoids both estimation mechanisms for populated Earn asset requests. D01 and E08 describe related layers of this same problem; they should not inflate a vulnerability count.
2. **The first allowance fix generalized EVK behavior incorrectly.** EVK tries Permit2 and falls back to ERC20 approval. Earn and relevant periphery helpers can select Permit2 and then propagate its failure, even if direct allowance is sufficient. E11's recheck prompted a further local diagnostic correction. The approval resolver still has a related limitation explained below.
3. **The Aave zero-address finding is not established on the pinned Pool.** The SDK calls Pool `getReserveData`; its legacy stable-debt field differs from the DataProvider's zero-returning compatibility field. The guard remains useful for compatible deployments returning zero, but that is a conditional case.
4. **Downstream swap protection was described too broadly.** The exported allowlist assertion is not generally invoked by built-in planners. A real, configured verifier's output/debt checks are a different protection; calls to a zero verifier do not perform them. The quote checks concern unsafe configuration/response acceptance. No fund-loss exploit was executed or established.
5. **Several entries are hardening, not normal production failures.** Examples include malformed decoded simulation arrays, invalid batch sizes, intended but unused API aliases, unknown callback identities, and conservative rejection of repeated materialized Permit2 keys. Each detailed entry names its actual condition.
6. **Pyth's cache collision does not by itself establish a current fee failure.** Actual Pyth source counts duplicate messages, but a fee effect needs nonzero per-update fees and differing multiplicity. Current official Core fee documentation says mainnet fees are zero; no ordinary Hermes duplicate-response incident was demonstrated.

## Detailed evidence for every entry

All 50 detailed entries follow this overview. The individual reports are also linked below.

Each entry includes original SDK locations, the relevant contract/API/SDK authority, trigger, consequence, fix assessment, regression evidence and remaining uncertainty. Some findings belong entirely to SDK caching or display logic; attaching an unrelated EVC citation would not strengthen them.

- [Execution E01–E14](execution.md): plans, approvals, simulation, EVC checks and state overrides.
- [Data D01–D15](data.md): account discovery, Earn/EVK arithmetic, oracle routes and portfolio values.
- [Swap/migration/rewards S01–S10](swap-rewards.md): external protocols, quote validation, CoW and reward sources.
- [Infrastructure I01–I11](infrastructure.md): cache/queue behavior, plugins, configuration and diagnostics.

These are **50 prior report entries**, not 50 independent vulnerabilities. I05 duplicates E09; D01 and E08 overlap at the inherited Earn preview, while the later pending-fee problem is distinguished explicitly. The inventory records all entries so no narrowed or refuted claim silently disappears.

## Remaining issues that prevent a “fully fixed” claim

- **Mint approvals remain estimates (E07).** Rounding the final WAD multiplication upward fixes the original floor error, but a WAD exchange rate can already have lost precision. Even without elapsed time, adjusted totals `shares=WAD+1`, `assets=WAD+2` yield a floored WAD rate of1; minting one share requires two asset units while the estimate says one. The default1:1 estimate and changes before inclusion are further limits. The existing API cannot manufacture an exact live preview from a rounded rate.
- **Preferred Permit2 approval resolution remains incomplete (E11).** Earn or a compatible helper may choose its live Permit2 route even when the wallet has sufficient direct approval. If token→Permit2 approval is too low, the operation can revert. The route-aware diagnostic catches the checked case; the existing direct-allowance shortcut in approval resolution does not automatically repair it. An actual simulation under the intended allowances remains necessary. Detection and automatic resolution are separate guarantees.
- **Earn snapshot display conversions remain fee-incomplete (D01).** The exact asset planning path is protected, but raw lens supply lacks pending fee shares. Snapshot conversion methods are not live contract previews.
- **Missing account metadata and source coverage remain unknown (D05/D06/D08).** Preserving known balances does not reconstruct missing controllers or modes. Fallback/indexer discovery can still be incomplete, and no deployed subgraph or production-fork matrix was exhaustively checked.
- **Simulation and custom integrations remain conditional.** Synthetic balances/approvals, wallet-read failures, custom spenders/plugins and changing external state limit what `canExecute` means. Recognizing a source-reported vault type is not deployed-bytecode attestation. CoW settlement, concurrent nonces, pending Morpho interest and arbitrary tokens are not proved by these fixes.

## Verification boundaries

Fresh results, recorded in [recheck validation.json](validation.json):

| Check | Result |
| --- | --- |
| Full SDK suite, normal timeout | 1,277 passed in 57 files; no type errors |
| SDK build and separate typecheck | Passed |
| Final simulation suite after formatting | 32 passed |
| Actual pinned EVC Solidity tests | 4 passed, including failed-prepend/successful-read behavior |
| Compiled EVC ABI | 44 function signatures/returns/mutability matched |
| Lens field layout | 21 structs, 59 tuple occurrences; names/order only |
| Reviewed source inventory | 189 source files matched |
| Finding inventory | All E01–E14, D01–D15, S01–S10, I01–I11 recorded once |
| Pinned source links | 163 references checked for file existence/line bounds across 85 distinct files/revisions |
| Whitespace | Passed |

The earlier Lean/TLA results remain historical evidence in [the prior validation record](../validation.json); their unchanged models were not rerun during this recheck. The full SDK suite above does rerun the TypeScript correspondence tests. Passing regressions establish the exercised paths, not absence of all bugs; Lean/TLA models do not prove all TypeScript, contracts, RPC responses, API producers or deployments. Link validation proves that a citation resolves to a real file/line, not that its associated interpretation is correct.

An initial full-suite attempt in the restricted sandbox failed six network/local-server tests with DNS/permission errors. It is not counted as a clean validation result. Tests requiring those capabilities must run with the applicable local/network permissions.


---

# Independent recheck: execution E01–E14

Rechecked against **original SDK `ff224741c251cae7673c5f835dcf3bbccd9d6605`**, using `git show HEAD:packages/euler-v2-sdk/src/<path>`, separately from the current local corrections. SDK locations below are relative to `packages/euler-v2-sdk/src/`; their line numbers refer to that original commit unless explicitly called current. Test paths are relative to `packages/euler-v2-sdk/test/`. Source inspection is not deployment attestation or evidence of a live incident.

| Source label | Exact revision |
| --- | --- |
| EVC | `ethereum-vault-connector@838e5f72eaea25fab7d242760245244226096054` |
| EVK | `euler-vault-kit@bfb325a6e6ca09613d940b46f72ccfe017353933` |
| Earn | `euler-earn@ea3dacc05f4003a1326815429d70d0c77f0dabb4` |
| Periphery | `evk-periphery@816c5943e5fab3a213e907dd5beaf9542305593a` |
| Periphery's Earn dependency | `euler-earn@b2fd6e699ee20bcfe7459f375b3cee5d2fa53345`, read separately; its transfer helper agrees with Earn above |
| Installed RPC client | `viem@2.48.8`, from the installed locked dependency tree |

## E01 — Batch normalization changes EVC behavior

**Status: confirmed bug; current fix adequate for preserving calls within one intentionally merged transaction.** Original [services/executionService/executionService.ts:475–531](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/executionService.ts#L475) cancels opposing collateral transitions and suppresses repeats; `1903–1909` applies it from `mergePlans`. An account with collateral already enabled can submit enable then disable; removing both leaves it enabled. Intervening calls can also observe state or require it. The public merge API makes this reachable without malformed data.

EVC [src/EthereumVaultConnector.sol:416–479](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L416) modifies membership, emits events on changes, and schedules checks even for idempotent calls; `600–613` executes calls in order and fails on a failed call. Current merge retains the complete call sequence and metadata. This does **not** prove that combining previously separate transactions preserves their separate final checks; merging explicitly chooses atomic composition (E02).

Evidence: `batchComposition.test.ts:144–329` includes initial-state, intervening observation, selector-collision/context/value, and input-immutability cases. `formal/integration/EvcSemantics.t.sol:testHistoricalCancellationChangesActualEvcState` checks the actual pinned EVC. Lean's generic append theorem proves ordered regrouping under one shared finalization boundary, not the removed optimizer or arbitrary transaction merging.

## E02 — Simulation erases transaction boundaries

**Status: confirmed bug; conservative rejection is adequate.** Original [services/executionService/simulate.ts:589–590,796–812](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/simulate.ts#L589) extracts every `evcBatch` into operations and executes them in one simulated batch. Original `execute.ts:294–315` sends each batch as a separate transaction. Disable collateral in the first batch and restore it in the second: the first real transaction can fail its final health check, while one combined simulation succeeds.

EVC [src/EthereumVaultConnector.sol:600–613,619–648](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L600) establishes the boundary: each batch defers checks within that invocation, while `batchRevert` collects the checks after its entire input vector. Current simulation rejects more than one EVC batch before RPC. `simulate.test.ts`, “simulation rejects separate EVC transaction boundaries…”, checks that rejection; `EvcSemantics.t.sol:testSeparateAndMergedBatchesHaveDifferentStatusCheckBoundaries` establishes the contract distinction. This intentionally removes unsupported multi-transaction simulation rather than implementing stateful transaction sequencing.

## E03 — Orphaned signatures and late invalid-plan detection

**Status: confirmed SDK workflow bug for caller-authored invalid boundaries; fixed.** Original [services/executionService/execute.ts:235–287](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/execute.ts#L235) sends token approvals and collects Permit2 signatures before knowing that an EVC insertion point exists. `294–315` consumes signatures only at an EVC batch; `327–347` handles a direct call, checks its chain late, and clears pending permits. An end-of-plan permit is also silently unused. Built-in valid deposit plans do have insertion points; manually concatenated/raw plans expose the problem.

No EVC bug is alleged. EVC [src/EthereumVaultConnector.sol:604–610](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L604) can execute only calls actually included. A signature discarded by the SDK is never submitted to it. Current complete-plan preflight rejects orphan permits, unresolved requirements and wrong-chain direct calls before wallet callbacks. `execute.test.ts` invalid-boundary matrix near line 597 checks raw/already-resolved paths and zero wallet interactions. Original materialization already rejected orphan permits (`materializedExecution.ts:461–488`), so that part is not a new materialized-execution finding.

## E04 — Repeated Permit2 keys

**Status: confirmed raw-execution nonce bug under normal Permit2 semantics; materialization restriction is conditional hardening.** Original [services/executionService/execute.ts:258–285](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/execute.ts#L258) reads the same current nonce for each pending permit before the containing EVC batch is sent. Two requirements for the same owner/token/spender produce signatures for nonce N twice. The first permit advances the nonce; the second cannot consume N again. Merge/aggregate requirements first or separate their executed batches.

Earn's pinned [src/interfaces/IAllowanceTransfer.sol:8–14](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/interfaces/IAllowanceTransfer.sol#L8) identifies the key and documents nonce updates on signed approval. EVC [src/EthereumVaultConnector.sol:604–610](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L604) makes failure of a later permit revert the batch. This review did not execute a deployed Permit2 instance; the conclusion assumes its documented standard nonce semantics, not an arbitrary contract configured at the Permit2 address.

Original materialization accepted explicit nonce inputs (`materializedExecution.ts:379–415`). Its all-slot prechecks/signature checks are conditional on `permit2NonceMustEqualPinned` (`695–705,720–727`), and dispatch rechecks only the relevant request (`663–667`). Therefore **not every repeated materialized key was inherently invalid**: explicit N,N+1 scheduling with revalidation disabled could work. The current blanket rejection avoids unsupported scheduling but restricts that prior capability. `execute.test.ts` duplicate-key matrix and `materializationIntegrity.test.ts:265` cover rejection before wallet work; neither is an on-chain Permit2 nonce integration test.

## E05 — Chain/account snapshot consistency

**Status: defensive hardening against contradictory caller context; not an established wrong-chain signing exploit.** Original [services/executionService/executionService.ts:924–944,954–965,1218–1246](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/executionService.ts#L924) accepts an Account plus a separate chain ID, forwards both to plugins, and extracts only its owner. `2055–2077` reads Wallet allowances without checking wallet chain or approval owner. Supplying a snapshot for another chain/owner can select the wrong plugin metadata or skip needed approvals.

Current checks bind Account chain at public entry points and bind Wallet chain/owner before mutating resolutions. `executionService.test.ts`, “execution entry points reject account snapshots…” and “approval resolution binds wallet chain and owner…”, cover these conditions. This is SDK input consistency, not a missing EVC authorization check: EVC [src/EthereumVaultConnector.sol:604–608](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L604) still authenticates calls; the SDK's caller-provided wallet callbacks select the actual signer/network. Bare addresses carry no chain metadata, and this patch cannot attest callback identity.

## E06 — Address casing changes execution

**Status: confirmed bug; inspected comparisons fixed.** Original [services/executionService/encode.ts:459–460](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/encode.ts#L459) can disable an existing controller merely because the same address uses different casing. EVK [src/EVault/modules/RiskManager.sol:55–60](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/modules/RiskManager.sol#L55) rejects controller removal with debt, so an otherwise valid borrow can revert. Original `encode.ts:926–948` and `executionService.ts:2883–2897` can misclassify equal asset/vault addresses; `executionService.ts:2077` can miss an existing normalized allowance key.

These are valid `Address` values, not malformed input. Current `getAddress` comparisons preserve the intended identity. `executionService.test.ts` casing regression decodes a borrow without a spurious disable and same-vault repayment as `repayWithShares`; its wallet regression checks no unnecessary approval. Contract addresses are 20-byte identities, so text case is not a protocol distinction. The tests do not exhaust every address field in the SDK.

## E07 — Mint approval rounding

**Status: confirmed final-rounding bug; current correction is partial, not exact preview parity.** Original [services/executionService/executionService.ts:2469–2471](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/executionService.ts#L2469) computes floor(shares × supplied WAD rate / WAD). EVK [src/EVault/modules/Vault.sol:71–73,139–147](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/modules/Vault.sol#L71) uses shares-to-assets **ceiling**, implemented in [src/EVault/shared/types/Shares.sol:29–34](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/shared/types/Shares.sol#L29); adjusted totals include 1,000,000 virtual assets/shares (`shared/lib/ConversionHelpers.sol:13–23`). Earn also rounds mint assets up ([src/EulerEarn.sol:571–575](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/EulerEarn.sol#L571)). With one share and an exactly represented rate of 1.5, approval 1 is insufficient for the required 2. A finite direct/Permit2 approval can therefore make mint revert; existing larger approvals or unlimited resolution can mask it.

Current final multiplication uses ceiling; `executionService.test.ts`, “planMint rounds the provided share exchange rate upward…”, establishes that narrow correction. **Same-time quantization remains:** adjusted shares `WAD+1`, adjusted assets `WAD+2` yield floor(WAD × assets / shares) = WAD. Current one-share approval is 1; the contract ceiling is 2. Both totals fit EVK's uint112 bounds. An independent invocation of the current `ExecutionService.prototype.planMint` with that rate reproduced `{sdkApproval:1n, contractAssets:2n}`. No elapsed-time drift is needed. Defaulting an omitted rate to 1 and future accrual are additional limits. An exact contract preview or exact sufficient quantity input is needed to close the general issue; the current API's rounded rate cannot recover discarded precision.

## E08 — Earn asset-denominated redeem: corrected baseline claim

**Status: confirmed wrong-quantity planning bug; the original underdelivery claim is retracted. Overlaps data finding D01.** Original [entities/ERC4626Vault.ts:102–105](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/ERC4626Vault.ts#L102) returns `assets` from `previewWithdraw`; original [entities/EulerEarn.ts:141–153](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/EulerEarn.ts#L141) overrides floor conversions but has no preview override. Original [services/executionService/executionService.ts:2580–2598](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/executionService.ts#L2580) therefore encodes `redeem(requestedAssets)` as though every asset required one share.

Pinned Earn [src/EulerEarn.sol:602–610](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/EulerEarn.sol#L602) accrues fees and floors the assets returned by redeem. Its line 608 explicitly states the exchange rate never falls below 1 because losses are not realized. Formulas at `671–692` add the **same 1,000,000 virtual amount to both totals**; loss and fee treatment is `898–927`, and the fee ceiling is 50% (`libraries/ConstantsLib.sol:19–23`). Thus the original one-for-one conversion can burn too many shares and deliver **more** assets than requested, or revert if share balance/liquidity is insufficient. Successful underdelivery is not established for this original path on the reviewed Earn implementation.

Exact example, recalculated with integer arithmetic: raw supply 100,000,000; prior assets 100,000,000; current assets 120,000,000; fee 20%; requested assets 1,000,000. Fee assets are 4,000,000 and accrued fee shares floor(4,000,000 × 101,000,000 / 117,000,000) = **3,452,991**. Original planner redeems **1,000,000 shares**, yielding **1,158,415 assets**. The intermediate local snapshot-preview fix would use **834,711 shares**, yielding **966,942 assets** because it omitted fee shares. That shortfall belongs to the intermediate change, not original main. Exact withdraw requires **863,248 shares** at these totals.

Current populated-Earn asset requests encode `withdraw(assets)`; Earn `580–592` accrues interest and computes the ceiling shares on chain while preserving the requested asset amount. Explicit share requests still redeem. `executionService.test.ts`, “EulerEarn asset-denominated redeem enforces assets…”, makes snapshot preview throw and verifies that the asset branch never calls it, decodes exact withdraw and explicit redeem, and checks collateral ordering/metadata. Adequate for this executable asset intent. Snapshot display conversions still omit pending fee shares; generic/non-Earn snapshot redeems and live liquidity remain separate limitations.

## E09 — Missing EVC health/read dependencies

**Status: confirmed dependency-model bug; fix adequate within static selector model.** Original [utils/healthCheckSets.ts:148–177,180–215,285–301](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/healthCheckSets.ts#L148) mutates its local sets without marking EVC-only calls' decoded account as checked, clears every controller on raw EVC disable, and omits reorder. Original [services/executionService/simulate.ts:1589–1599](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/simulate.ts#L1589) infers only three EVC transitions and omits disable-controller/reorder account reads.

EVC [src/EthereumVaultConnector.sol:416–479](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L416) schedules checks for all five operations, including idempotent calls. Raw disable removes **msg.sender**, not all controllers (`475–479`). EVK's zero-argument `disableController` is a separate authenticated vault call (`RiskManager.sol:55–60`). Missing dependencies can omit needed oracle/plugin preparation or simulated account/controller reads. They **do not remove the real EVC's on-chain checks**.

Current model adds decoded accounts, reorder and EVault disable; raw EVC disable conservatively retains controllers because static calldata does not identify/authenticate the caller. An optional EVC-address argument binds EVC selector interpretation; legacy omission still infers by selector. `healthCheckSets.test.ts:246` covers EVC-only transitions, and `simulate.test.ts` covers decoded-account reads and unrelated destinations. Actual-EVC idempotent-check fixture adds contract evidence. Arbitrary nested calls/hooks remain outside this static model.

## E10 — Missing/malformed simulation arrays

**Status: defensive hardening; ordinary honest-EVC malformed-RPC success is not established.** Original [services/executionService/simulate.ts:1723–1753](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/simulate.ts#L1723) trusts a provider's decoded result and treats missing results/check arrays as empty. A custom provider returning `undefined`, or ABI-valid but semantically wrong empty arrays from a misconfigured contract, can bypass action failures; current structural and result-count checks reject them.

However installed viem [installed viem simulateContract.ts:274–290](/Users/kanv/Documents/euler/euler-sdks/node_modules/.pnpm/viem@2.48.8_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10_zod@4.3.6/node_modules/viem/actions/public/simulateContract.ts:274) calls `decodeFunctionResult` before returning. Missing bytes and structurally truncated ABI data normally throw there and reach the SDK's existing error branch (`1733–1738`), rather than becoming `undefined`. Pinned EVC [src/EthereumVaultConnector.sol:632–644,652–680](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L632) allocates exactly one call result per input and returns all three ABI arrays. Its successful nonempty response cannot naturally be the empty mocked response. `simulate.test.ts`, “simulation cannot approve missing action results…”, mocks **decoded provider results**, not an actual corrupted RPC response through viem. The new check is valuable boundary validation, not a demonstrated normal-node protocol defect.

## E11 — Allowance route diagnostics: original and corrected local fix

**Status: confirmed original false-rejection bug and missing route information; initial local OR fix was incomplete. Diagnostics corrected further; resolver remains incomplete.** Original [services/executionService/simulate.ts:1895–1909](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/simulate.ts#L1895) independently emits direct and Permit2 deficits, while `760–766` requires both absent. EVK can succeed with either route, so valid direct-only or Permit2-only approval is falsely rejected. Token→Permit2 allowance was omitted. That omission alone did **not** establish an original false-positive: the original direct-allowance requirement often still blocked it.

Routes are contract-specific:

| Contract/source at pinned revision above | Actual rule |
| --- | --- |
| EVK [src/EVault/shared/lib/SafeERC20Lib.sol:27–42](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/shared/lib/SafeERC20Lib.sol#L27) | Try configured Permit2 for uint160-sized amounts, then direct ERC20 transfer if it fails. |
| Earn [src/libraries/SafeERC20Permit2Lib.sol:35–50](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/libraries/SafeERC20Permit2Lib.sol#L35), called by [src/EulerEarn.sol:697–699](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/EulerEarn.sol#L697) | If Permit2 spender amount and expiration suffice, use Permit2 and propagate transfer failure. Otherwise use direct. It does not retry direct after Permit2 fails. |
| Periphery [src/Vault/implementation/ERC4626EVC.sol:23,75–76](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Vault/implementation/ERC4626EVC.sol#L23); Securitize constructor inheritance [src/Vault/deployed/ERC4626EVCCollateralSecuritize.sol:26,57](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Vault/deployed/ERC4626EVCCollateralSecuritize.sol#L26) | Same preferred helper. |
| Periphery [src/Swaps/SwapVerifier.sol:16,26](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Swaps/SwapVerifier.sol#L16) and `MigrationHelper.sol:65,73–82` | Configured verifier inherits the preferred helper and exposes `permit2()`, not `permit2Address()`. Exact helper dependency at `b2fd6e699ee20bcfe7459f375b3cee5d2fa53345:src/libraries/SafeERC20Permit2Lib.sol:35–50` was fetched and checked. |
| Arbitrary/generic ERC4626 spender | The interface establishes no Permit2 route. No route is inferred. |

Concrete counterexample to the first local fix: requirement 100, direct allowance 100, token→Permit2 95, Permit2→Earn 1,000, unexpired. EVK can fall back and succeed; Earn chooses Permit2 and reverts. The generic OR formula incorrectly accepted both.

Current recheck patch reads vault type and each recognized spender's actual Permit2 getter, verifies it matches the allowance snapshot's deployment Permit2, and applies the corresponding route. A zero Permit2 address uses direct only. The canonical configured verifier gets the correct getter; unrelated custom addresses are unknown. `allowanceDiagnosticsUnavailable?: Array<{token,spender,reason}>` explicitly records unknown type, missing configuration read or mismatched Permit2; when present `canExecute` is false. Zero requirements need no route queries. New overhead is one type lookup for vault spenders plus one getter read per unique recognized nonzero spender per simulation. These are source/deployment metadata assumptions, **not bytecode attestation**.

Expanded `simulate.test.ts`, “simulation accepts either complete allowance path…”, tests both EVK routes, token→Permit2 shortfall, Earn/Securitize preference and expiry fallback, disabled/mismatched Permit2, unknown generic spender without a getter probe, zero requirements, failed configuration reads, unknown routing despite successful action simulation, and canonical verifier `permit2()` with failure/success. These are controlled provider tests, not token/Permit2 EVM integration tests.

**Remaining actual resolver limitation:** original [services/executionService/executionService.ts:2139–2146](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/executionService.ts#L2139) (current method's direct-allowance shortcut) sets `resolved=[]` whenever direct approval covers the amount. For the Earn counterexample above, it does not repair token→Permit2 approval; direct execution can still revert. `usePermit2:false` also cannot force an Earn contract to stop preferring an already-live Permit2 route. Diagnostic detection is not automatic approval repair. Further limits: wallet-service absence/fetch failure still returns no diagnostics; per-requirement finite allowances are not sequentially consumed; expiration uses the host clock, not a pinned block timestamp. These are explicitly not covered by a “fully fixed” verdict.

## E12 — Deposit-all balance overrides

**Status: confirmed simulation bug for max-sentinel plans; fixed within built-in sentinel semantics.** Original [services/executionService/simulate.ts:1937–1947](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/simulate.ts#L1937) and [utils/stateOverrides/getStateOverrides.ts:67–81](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/stateOverrides/getStateOverrides.ts#L67) sum maxUint256 as a literal funding requirement. With ordinary storage-compatible ERC20s this forges a max balance. EVK [src/EVault/modules/Vault.sol:124–130](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/modules/Vault.sol#L124) interprets `deposit(maxUint256)` by reading the account's balance; `shared/types/Types.sol:68–70` rejects values above the uint112 sane bound. A real affordable deposit-all can therefore fail synthetic simulation because the override changed its amount.

Current extraction preserves live balance whenever a token has a max requirement, also when mixed with fixed requirements. Zero retained requirements keep wallet snapshot coverage without probing/forging balances. `stateOverrideComposition.test.ts:57` checks ordering/multiplicity and both entry points, while `simulate.test.ts` checks requirement extraction. This is conditional on balance overrides being enabled and successfully supported by the token; state-dependent arbitrary custom calldata cannot be inferred from approval metadata alone.

## E13 — State override composition

**Status: confirmed loss of code/full state; duplicate-slot claim narrowed to cleanup.** Original [utils/stateOverrides/mergeStateOverrides.ts:23–41,44–50](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/stateOverrides/mergeStateOverrides.ts#L23) copies only address/balance/nonce/stateDiff. Caller-supplied `code` and full `state` disappear even for a single entry. Simulations of injected code/storage consequently use different state than requested. This is a viem/RPC composition bug, not an EVC contract defect; installed viem [installed viem stateOverride.ts:65–75](/Users/kanv/Documents/euler/euler-sdks/node_modules/.pnpm/viem@2.48.8_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10_zod@4.3.6/node_modules/viem/utils/stateOverride.ts:65) supports those fields.

Original duplicate slots were concatenated, but installed viem's `serializeStateMapping` ([installed viem stateOverride.ts:29–48](/Users/kanv/Documents/euler/euler-sdks/node_modules/.pnpm/viem@2.48.8_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10_zod@4.3.6/node_modules/viem/utils/stateOverride.ts:29)) already serializes to an object with later values winning. Therefore ordinary duplicate slots were **not established as a separate broken-RPC behavior** in this dependency version. Deduplication makes the SDK representation clearer; it should not inflate the confirmed bug count.

Current merge preserves code/full state, replaces complete state, patches diffs, and rejects simultaneous full-state/diff in one input. `stateOverrideComposition.test.ts:16` checks ordering, empty/zero replacements and immutability. Actual RPC support for custom code/full storage remains provider-dependent; no on-chain state is changed.

## E14 — noAllowanceOverride inconsistency

**Status: confirmed documented-behavior/extra-RPC bug; fix adequate.** Original public option comments promise skipping ERC20 allowances while retaining deterministic Permit2 state ([utils/stateOverrides/getStateOverrides.ts:26–31](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/stateOverrides/getStateOverrides.ts#L26); [services/executionService/simulate.ts:319–324](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/simulate.ts#L319)). The general paths instead emit no approval state (`getStateOverrides.ts:158–163`, `simulate.ts:452–463`). The fast path calls the full probing helper then filters away ERC20 output (`simulate.ts:402–429`), so it still incurs the supposedly skipped reads/probes and can fail on them.

Current paths use pure `computePermit2StateDiff` when the flag is set. `stateOverrideComposition.test.ts:36` covers balance override enabled/disabled, supplied sufficient wallet values and both entry points, with a provider that must not be queried for allowance probes. This flag describes hypothetical simulation state, not actual wallet authorization. Earn's packed Permit2 interface ([src/interfaces/IAllowanceTransfer.sol:8–14](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/interfaces/IAllowanceTransfer.sol#L8)) supports the storage fields involved, but exact Permit2 slot layout remains the existing helper's assumed standard implementation; this fix does not independently prove that layout for every configured deployment.

## Validation and boundaries

- Recheck focused execution command: `pnpm --filter @eulerxyz/euler-v2-sdk exec vitest run test/simulate.test.ts test/executionService.test.ts test/execute.test.ts test/healthCheckSets.test.ts test/stateOverrideComposition.test.ts test/materializationIntegrity.test.ts test/batchComposition.test.ts test/materializedExecution.test.ts` — **146 tests / 8 files passed** before the canonical-verifier addition; then the expanded simulation file passed **32/32** after that addition. The final aggregate recheck records the final run.
- SDK typecheck passed after the verifier addition. The parent subsequently ran the full **1,277 tests / 57 files** and build successfully with the canonical-verifier patch included; see aggregate recheck validation. `git diff --check` passed.
- Arithmetic counterexamples above were independently evaluated with bigint integer formulas; current `planMint` was invoked directly to reproduce the residual 1-versus-2 estimate. No loss-making transaction or deployed exploit was executed.
- Existing Lean/TLA scope remains accurately bounded: fixed snapshot arithmetic and abstract ordered execution/failure models, finite TypeScript correspondence tests, and a few actual-EVC examples. None of E07 rate precision, Earn fee accrual, spender capability metadata, RPC decoding or arbitrary token behavior becomes proved by those models.
- E08 overlaps D01, E09 overlaps plugin dependency findings, and E13's duplicate-slot cleanup is not an independent defect. E05/E10 are primarily defensive boundary checks. The 14 entries must not be presented as 14 independent production vulnerabilities, nor as all fully resolved.


---

# Independent recheck of D01–D15

This recheck supersedes broader interpretations of the D01–D15 descriptions in `../data-review.md`. It compares the original SDK at `ff224741c251cae7673c5f835dcf3bbccd9d6605` (read with `git show HEAD:path`) with the current uncommitted fixes and the sources below. No production files were changed during this recheck.

“Confirmed” means the stated code path and consequence follow from the inspected implementation; it does not mean a deployed incident was observed. “Conditional” identifies a supported but unverified deployment/input condition. “Hardening” identifies invalid/custom configuration or additional compatibility rather than a defect in the normal first-party configuration. None of these items proves theft, an onchain enforcement bypass, or complete SDK correctness.

## Source identities and evidence boundaries

SDK paths below are relative to `packages/euler-v2-sdk/`; all **baseline** line numbers refer to the original SDK commit, not the changing working tree. Upstream paths are relative to these repository roots and commits:

| Label | Local source root | Commit |
| --- | --- | --- |
| EVC | `/private/tmp/euler-sdk-integration-review/ethereum-vault-connector` | `838e5f72eaea25fab7d242760245244226096054` |
| EVK | `/private/tmp/euler-sdk-integration-review/euler-vault-kit` | `bfb325a6e6ca09613d940b46f72ccfe017353933` |
| Periphery | `/private/tmp/euler-sdk-integration-review/evk-periphery` | `816c5943e5fab3a213e907dd5beaf9542305593a` |
| Earn | `/private/tmp/euler-sdk-integration-review/euler-earn` | `ea3dacc05f4003a1326815429d70d0c77f0dabb4` |
| Oracle | `/private/tmp/euler-sdk-integration-review/euler-price-oracle` | `bc70a37b9a22d57e5d47d144644617f9be62ba3a` |
| API | `/Users/kanv/Documents/euler/euler-data-v3` | `fc9485fe2d7a38028871c59f2540118fe2a5c691` |

The API checkout has untracked review directories; the inspected tracked source is unchanged. The OpenAPI artifact is `/private/tmp/euler-sdk-integration-review/openapi.json`, SHA256 `eb30fc696a5d90a15b1ca8ce0786abdf82480b423eb4cc418eeb64988279a8d9`. It is supplementary schema evidence, not an attestation of every live response. None of the pinned contract sources by itself establishes deployed-bytecode identity.

Independent current validation: `pnpm -C packages/euler-v2-sdk exec vitest run test/dataIntegrationParity.test.ts test/accountPortfolio.test.ts test/oracleOnchainParity.test.ts` passed **56 tests in 3 files**, with no type errors. This recheck did not rerun those tests against the original production tree. Baseline conclusions below come from original-code inspection and source-derived reproductions; the current passing tests must not be presented as an independently observed baseline red run.

## Findings

## D01 — Confirmed inherited conversion defect; snapshot fix has an explicit remaining limit

**Verdict:** Confirmed; snapshot fix adequate within its documented scope, with pending-fee parity still conditional.

**Baseline:** [src/entities/ERC4626Vault.ts:97–105](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/ERC4626Vault.ts#L97-L105) returns `assets` directly from `previewWithdraw`. [src/entities/EulerEarn.ts:141–153](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/EulerEarn.ts#L141-L153) overrides `convertToAssets` and `convertToShares`, but does not override `previewWithdraw`. Inheritance does not dispatch through those overrides because the inherited method literally returns its argument. [src/services/executionService/executionService.ts:2556–2598](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/executionService.ts#L2556-L2598) uses the preview for `planRedeem({ assets })`, then encodes a share-denominated redemption.

**Authority:** Earn [src/EulerEarn.sol:580–610,653–692](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/EulerEarn.sol#L580-L610) accrues fees and applies the virtual-adjusted conversion, ceiling for withdraw and floor for redeem. [src/libraries/ConstantsLib.sol:23](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/libraries/ConstantsLib.sol#L23) fixes the virtual amount at 1,000,000. Periphery [src/Lens/EulerEarnVaultLens.sol:32–33](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/EulerEarnVaultLens.sol#L32-L33) reads `totalSupply()` and `totalAssets()`; Earn [src/EulerEarn.sol:616–619,898–928](https://github.com/euler-xyz/euler-earn/blob/ea3dacc05f4003a1326815429d70d0c77f0dabb4/src/EulerEarn.sol#L616-L619) establishes that those snapshots omit the pending shares included by live conversions.

**Trigger/consequence:** Once the exchange rate differs from 1:1, the inherited share estimate is wrong. For valid yield-accrued Earn state, the original estimate generally uses **too many** shares: an asset-target redemption can return more assets than requested or revert if the user has enough assets but insufficient shares for that estimate. Earn explicitly describes its exchange rate as never below 1 (`:608`); below-1 test fixtures exercise algebra, not an established Earn state.

**Fix:** The entity now ceilings the snapshot conversion, which is adequate for its newly documented snapshot semantics. It is **not** a fee-aware live preview. Independently recomputing the source formulas confirms the report's example: supply 100,000,000, assets 120,000,000, prior assets 100,000,000, 20% fee => 3,452,991 pending fee shares; 1,000,000 assets needs 834,711 shares by snapshot versus 863,248 live, and the snapshot estimate redeems 966,942 assets after accrual. This shortfall is a separate mechanism from the original 1:1 overestimate. The accompanying execution fix routes populated Earn asset requests through exact `withdraw`, which lets the contract calculate shares after accrual. Current snapshot-rounding tests establish minimal sufficient shares at the stored rate, not live fee parity. Display conversions remain conditional approximations when fees are pending.

## D02 — Confirmed contract-parity defect in liquidation LTV display/calculation

**Verdict:** Confirmed; fixed for canonical contract-derived inputs.

**Baseline:** [src/entities/EVault.ts:240–259](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/EVault.ts#L240-L259) interpolates JavaScript fractional basis points when initial and target LTV differ, including increases.

**Authority:** EVK [src/EVault/shared/types/LTVConfig.sol:35–56](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/shared/types/LTVConfig.sol#L35-L56) returns the target immediately for increases and completed ramps; a decreasing active ramp uses integer division at `:50–52`. Its setter at `:59–68` stores a canonical initial LTV and target timestamp.

**Trigger/consequence:** Active decreasing ramps can disagree by a fraction of one basis point; increases can be displayed as gradual despite immediate contract effect. This can alter an SDK threshold calculation near the boundary. It does not change the contract's liquidation rule.

**Fix/evidence:** The current comparison only ramps decreases and uses integer basis-point arithmetic. Tests cover decreasing 8500→8000 with integer truncation, an increase, and a completed ramp. Adequate for canonical contract-derived basis-point inputs; not a guarantee for arbitrary malformed entity values or stale timestamps.

## D03 — Conditional high-decimal compatibility defect, with a confirmed exception path

**Verdict:** Conditional compatibility defect; the exception is confirmed for UoA decimals above 18.

**Baseline:** [src/entities/EVault.ts:399–419](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/EVault.ts#L399-L419) computes `10n ** BigInt(18 - price.decimals)` for asset and collateral risk prices.

**Authority:** Periphery [src/Lens/VaultLens.sol:47–50](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/VaultLens.sol#L47-L50) uses the UoA token's decimals; [src/Lens/Utils.sol:140–148](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/Utils.sol#L140-L148) accepts a decoded `uint8` without an 18-decimal cap. EVK [src/EVault/shared/LiquidityUtils.sol:84–116](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/shared/LiquidityUtils.sol#L84-L116) establishes liability ask, collateral bid, and liquidation midpoint directions.

**Trigger/consequence:** A valid returned UoA precision above 18 makes the BigInt exponent negative and the getter throws. No deployed vault using this configuration was established in this recheck.

**Fix/evidence:** Division replaces multiplication above 18 decimals; the 24-decimal fixture covers asset mid/ask and collateral mid/bid. Adequate to remove that exception and preserve units. Scaling down truncates to WAD precision: this is not a proof that SDK risk prices reproduce every contract rounding result.

## D04 — Confirmed owner-mode loss when only a secondary subaccount is discovered

**Verdict:** Confirmed; fixed when at least one owner-prefix subaccount was fetched successfully.

**Baseline:** [src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.ts:198–219,250–255](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.ts#L198-L219) fetches discovered subaccounts, then reads modes only from the entry whose account equals its owner, defaulting to false otherwise.

**Authority:** EVC [src/EthereumVaultConnector.sol:260–272](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L260-L272) stores owner and both modes in `ownerLookup[addressPrefix]`. Periphery [src/Lens/AccountLens.sol:107–121](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Lens/AccountLens.sol#L107-L121) reads those modes using each account's prefix.

**Trigger/consequence:** A secondary subaccount is indexed and fetched successfully, the primary address has no discovered position, and one of the prefix-wide modes is true. Baseline reports it false despite already possessing the true value.

**Fix/evidence:** Falling back to any successfully fetched subaccount of that owner prefix is consistent with EVC semantics; the secondary-only regression preserves both flags. Empty discovery and complete read failure remain outside the fix. The source of discovered accounts is still trusted to respect the requested prefix.

## D05 — Confirmed balance loss on degraded API metadata; metadata completeness remains unresolved

**Verdict:** Confirmed; known balances preserved, missing metadata remains unknown.

**Baseline:** [src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.ts:292–332](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.ts#L292-L332) inspects only the first row's optional `subAccount`; if absent it returns `positions: []`, even when balance rows are valid.

**Authority:** API [src/application/services/account-discovery-service.ts:850–875](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/application/services/account-discovery-service.ts#L850-L875) constructs independently nullable balance and subaccount fields from snapshots. `:1203–1228` catches state-read failures and leaves existing metadata unchanged; it can remain null. [src/interface/http/routes/accounts.ts:547–586](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/interface/http/routes/accounts.ts#L547-L586) serializes balances and `subAccount: null` independently. This is an implementation-supported degraded/cached response, not solely an optional-field interpretation of the schema.

**Trigger/consequence:** Known shares/assets/debt with absent metadata are silently removed from the SDK subaccount. Absence only on the first row also loses metadata that a later row supplies.

**Fix/evidence:** Search all rows for metadata and preserve converted balance rows when none exists. The regression retains the known 20-asset position and a diagnostic. Adequate for balance preservation, but owner/controller/collateral arrays and modes remain defaulted/unknown in this fallback. It would be incorrect to call the result complete executable account state. This is distinct from D06: missing metadata does not itself mean the balances are unknown.

## D06 — Confirmed unknown-to-zero conversion prevents configured fallback

**Verdict:** Confirmed; nullable balances now make the snapshot unavailable so configured fallback can run.

**Baseline:** [src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.ts:240–263,566–610](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountV3Adapter/accountV3Adapter.ts#L240-L263) accepts nullable balance fields and calls `parseBigIntField`; [src/utils/parsing.ts:20–38](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/parsing.ts#L20-L38) converts non-string input to zero plus a warning. The account still has a defined result (`accountV3Adapter.ts:443–499`). [src/utils/fallbackAdapter.ts:73–105,174–186](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/fallbackAdapter.ts#L73-L105) intentionally does not fall back for warnings on defined results. [src/sdk/buildSDK.ts:703–711](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/sdk/buildSDK.ts#L703-L711) wires the V3→onchain fallback when configured.

**Authority:** API [src/application/services/account-discovery-service.ts:850–875](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/application/services/account-discovery-service.ts#L850-L875) uses null for unavailable balances; the account route at [src/interface/http/routes/accounts.ts:549–551](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/interface/http/routes/accounts.ts#L549-L551) preserves those values. OpenAPI `AccountPosition.borrowed` also distinguishes unknown null from string zero.

**Trigger/consequence:** Unknown shares, assets, or debt become known zero, concealing an incomplete snapshot and suppressing a configured second source. This requires a degraded response; a valid zero remains valid.

**Fix/evidence:** Any null/missing required balance makes the account snapshot unavailable and reports an error, enabling the existing fallback. Separate tests cover each field. This deliberately trades partial V3 availability for complete-balance semantics, and can invoke onchain discovery even if most rows were valid. It does not promise a fallback is configured, that fallback discovery is complete, or that every malformed numeric string is rejected by this change.

## D07 — Confirmed parseable subgraph-error handling defect

**Verdict:** Confirmed; parseable failure envelopes are rejected.

**Baseline:** [src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts:44–63,103–115](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts#L44-L63) and [src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.ts:52–72](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/vaultMetaService/adapters/VaultTypeSubgraphAdapter.ts#L52-L72) parse JSON without checking HTTP success or GraphQL errors, defaulting missing arrays to empty.

**Authority:** The [original SDK query and response accesses](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts#L44-L63) establish the expected data contract. No EVC/EVK contract controls HTTP/GraphQL response semantics. This finding does not need an assumed onchain state.

**Trigger/consequence:** A parseable HTTP error body, GraphQL error envelope, or missing data can appear to be empty discovery/unknown type. Narrow the original wording: socket errors and invalid JSON already throw in the baseline; not every transport failure was silently accepted.

**Fix/evidence:** HTTP status, GraphQL errors, and array-shape checks are adequate for the demonstrated cases; missing account-subgraph configuration now throws too. Tests cover HTTP 503, GraphQL errors, absent account data, and vault-type GraphQL failure. Partial GraphQL data accompanied by errors is now rejected as a whole. This is a defensible completeness policy, not a recovery mechanism or deep validation of every returned entity.

## D08 — Conditional truncation at the documented Graph default; narrower trigger than “100 requests”

**Verdict:** Conditional on documented Graph default and more than 100 matching prefix entities; chunking fix adequate.

**Baseline:** [src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts:29–76](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountVaultsSubgraphAdapter.ts#L29-L76) deduplicates owner prefixes but sends every unique prefix in one list query without `first`. [src/utils/callBundler.ts:58–61](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/callBundler.ts#L58-L61) defaults to unlimited batch size and a five-millisecond batching window.

**Authority:** [The Graph's querying documentation](https://thegraph.com/docs/en/subgraphs/querying/best-practices/) states the default collection result size is 100. This is official documentation evidence inspected on 2026-09-23, not a pinned deployed subgraph schema/Graph Node version or a live endpoint reproduction. No source SHA is claimed for that web page.

**Trigger/consequence:** More than 100 **distinct, existing indexed prefix entities**, on the same chain and in one bundle, can be truncated by that default. More than 100 repeated requests for one prefix, or 101 requests with only 100 matching entities, does not establish truncation. Missing returned entries become empty discovery through baseline lines 66–73 and 103–115.

**Fix/evidence:** Explicit `first: 100` with unique-prefix chunks of at most 100 is adequate assuming one result entity per prefix and the documented query semantics. The 101-prefix regression checks request shape and chunk sizes `[100, 1]`; it does not exercise a real server's truncation behavior. No improvement in indexer freshness, missing events, reorg handling, or global completeness is established. D07 and D08 share a file but have different triggers.

## D09 — Invalid-configuration hardening; distinguish the two failure mechanisms

**Verdict:** Hardening for invalid/custom configuration; specific nontermination mechanisms confirmed.

**Baseline:** [src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.ts:95–105,149–161](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.ts#L95-L105) accepts positive fractional `batchSize`, floors it, then increments an in-memory request-building loop by that value. [src/services/oracleAdapterService/oracleAdapterService.ts:376–407,437–467](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/oracleAdapterService/oracleAdapterService.ts#L376-L407) bounds `pageSize` with `Math.min/max` and uses it in empty/short-page termination.

**Authority:** The [original SDK batching implementation](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultV3Adapter/eVaultV3Adapter.ts#L149-L161) establishes the defect: the EVault failure happens before sending a request and is independent of an API implementation. The oracle case depends on what the configured query returns, so no normal live-API infinite loop is established.

**Trigger/consequence:** EVault `0 < batchSize < 1` produces zero and a synchronous non-advancing allocation loop. Oracle `pageSize=NaN` stays NaN; with repeated empty results lacking usable pagination metadata, `0 < NaN` is false and the request loop does not terminate. In contrast, oracle `Infinity` already became 100, and negative/0.5 values already became 1: they were not the same nontermination bug. A real server may reject a NaN limit before any loop repeats.

**Fix/evidence:** Finite integer-effective validation/defaulting prevents both demonstrated mechanisms. Current tests cover EVault 0.5 and normalized oracle invalid values. Adequate configuration hardening. Do not present all invalid-value fixtures as independently established hangs or any of these as a defect in the default configuration.

## D10 — Confirmed dead alias entries; first-party API impact not established

**Verdict:** Hardening for aliases; dead mappings confirmed, first-party API outage not established.

**Baseline:** [src/services/vaults/vaultMetaService/adapters/VaultTypeV3Adapter.ts:49–63,86–106](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/vaultMetaService/adapters/VaultTypeV3Adapter.ts#L49-L63) stores mixed-case `eulerEarn`/`securitizeCollateral` keys but normalizes lookup input to lowercase. It also has a resource-path fallback for Earn/EVK.

**Authority:** API [src/application/ports/vault-resolver-read-model.ts:1](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/application/ports/vault-resolver-read-model.ts#L1) defines canonical `evk | earn | securitize`, all handled correctly by baseline. [src/application/services/vault-resolver-service.ts:24–69](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/application/services/vault-resolver-service.ts#L24-L69) returns those values and builds the Earn/EVK resource path.

**Trigger/consequence:** An alternate/custom response using one of the SDK's intended aliases, without a recognized resource fallback, can resolve as unknown. An Earn alias with the ordinary `/v3/earn/vaults/…` resource already recovers. Current first-party alias emission is **not established** and is contradicted by the inspected canonical producer type.

**Fix/evidence:** Lowercase keys repair the SDK's dormant alias mappings. The two synthetic alias tests omit resource, correctly reaching the defect. Classify this as compatibility hardening, not a demonstrated current V3 classification outage. “Advertised” should mean intended entries in the SDK map; the nearby config documentation only advertises canonical examples.

## D11 — Confirmed internal aggregate-yield inconsistency, not onchain yield accounting

**Verdict:** Confirmed internal display inconsistency; context fix adequate, reward economics not independently validated.

**Baseline:** [src/entities/Portfolio.ts:628–676](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/Portfolio.ts#L628-L676) creates aggregate borrowed yield entries with only vault and borrowed USD value. The individual borrow getter already delegates to `borrowYieldPositions` at `:240–254`, whose implementation at `:738–766` adds collateral addresses, multiplier, and equity.

**Authority/intent:** Original SDK [src/utils/accountComputations.ts:664–704](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/accountComputations.ts#L664-L704) explicitly gates BORROW_COLLATERAL and LOOPING rewards on that context; `:807–853` matches collateral addresses and multiplier bounds. These existing SDK business rules, not an EVM contract, are the relevant authority for the claim that aggregate and individual views should be consistent. This recheck does not validate campaign APRs, reward eligibility policies, or realized income against a reward provider.

**Trigger/consequence:** A portfolio with an otherwise eligible collateral-dependent/looping reward displays less reward contribution in its aggregate breakdown than in the corresponding individual borrow breakdown. Ordinary BORROW rewards do not need the missing context and are unaffected.

**Fix/evidence:** Reusing the existing helper preserves the filtered collateral set and supplies the same context. Current BORROW_COLLATERAL and LOOPING tests assert agreement for a single-borrow portfolio with known values. Adequate to fix the omitted-context mechanism. They are not proof of complete multi-position aggregation, pricing completeness, every eligibility edge, or investment performance.

## D12 — Confirmed stale derived values after repeated population

**Verdict:** Confirmed; stale derived values cleared on refresh.

**Baseline:** [src/entities/Account.ts:813–843](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/Account.ts#L813-L843) updates position USD fields only when the new price exists, and borrowed USD only for positive debt. Collateral market price is also assigned only when present. Original [src/entities/ERC4626Vault.ts:116–129](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/ERC4626Vault.ts#L116-L129) explicitly replaces a missing/failed price with undefined, so the stale-value transition is reachable through the ordinary population methods.

**Authority:** The [original vault price-refresh method](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/entities/ERC4626Vault.ts#L116-L129) establishes replaceable price state; this is a local derived-data lifecycle defect, not a contract mismatch.

**Trigger/consequence:** Populate prices, then populate again after a price disappears, or after the same account entity's debt changes to zero. Old prices, supplied values, or borrowed values survive and can mislead portfolio display. Merely constructing a fresh account does not exhibit retained instance state.

**Fix/evidence:** Clear derived position fields before recomputing and assign collateral market price even when unavailable. The repeated-population test covers disappearance and debt repayment. Adequate for the demonstrated stale fields; undefined debt valuation after zero debt follows the existing unset-value convention. Partial aggregate valuation and stale upstream snapshots are separate unresolved concerns.

## D13 — Confirmed suppressed diagnostics on enrichment fallback

**Verdict:** Confirmed diagnostics defect; fixed, complementary to shared prepend validation.

**Baseline:** [src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.ts:182–185,244–290](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/adapters/eVaultOnchainAdapter/eVaultOnchainAdapter.ts#L182-L185) marks a second pass before it succeeds. On absent result/exception it returns the initial vault, but selects the absent final-pass diagnostic array instead of the initial errors. [src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.ts:458–487](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/accountService/adapters/accountOnchainAdapter/accountOnchainAdapter.ts#L458-L487) similarly falls back to an ordinary lens query without reporting enrichment failure.

**Authority:** EVC [src/EthereumVaultConnector.sol:619–638](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L619-L638) demonstrates that simulation collects individual call success/results; the SDK adapter's catch/undefined paths above independently establish fallback reachability. Failure can also arise from RPC or plugin exceptions. No assumption that all simulations fail is required.

**Trigger/consequence:** An enrichment attempt fails after an initial vault read that already had oracle diagnostics; the ordinary snapshot survives but warnings about its deficiencies disappear. The account branch conceals the failed enrichment while returning its ordinary result. The claim is about diagnostics and snapshot quality visibility, not newly corrupted raw balances.

**Fix/evidence:** Current fallback preserves initial errors and adds a `batchSimulation` warning; successful final-pass errors replace initial errors as intended. Tests exercise absent enrichment and original lens errors. Adequate. This is complementary to shared prepend-result validation, not a duplicate of the separate issue where failed prepend calls were mistaken for successful enrichment.

## D14 — Confirmed reverse CrossAdapter route rejection; Pyth effect is conditional

**Verdict:** Confirmed route-decoding defect; downstream Pyth-update consequence conditional.

**Baseline:** [src/utils/oracle.ts:684–705](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/utils/oracle.ts#L684-L705) accepts only the configured base→quote direction. Original [src/plugins/pyth/pythPlugin.ts:810–836](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/pyth/pythPlugin.ts#L810-L836) collects read-prepend feeds from the selected route and returns no update when that route yields no feeds.

**Authority:** Oracle [src/adapter/CrossAdapter.sol:29–36,45–60](https://github.com/euler-xyz/euler-price-oracle/blob/bc70a37b9a22d57e5d47d144644617f9be62ba3a/src/adapter/CrossAdapter.sol#L29-L36) explicitly requires bidirectional component oracles and executes quote/cross then cross/base for inverse quotes.

**Trigger/consequence:** Querying the reverse of an otherwise valid configured CrossAdapter pair returns no decoded route in baseline. If that route contains a relevant Pyth leaf and no alternative prefetched route supplies it, read enrichment can omit the update. A deployed inverse/Pyth combination was not independently located, so the production Pyth consequence remains conditional. Missing route alone is established.

**Fix/evidence:** The current decoder checks forward/inverse identity, visits inverse legs in contract order with reversed pair context, and rejects unrelated pairs. The inverse-Pyth regression confirms the leaf survives. Adequate for this supported tree shape; no general proof of nested/custom oracle route completeness or price freshness follows.

## D15 — Confirmed mixed-chain public-method defect; normal single-chain calls unaffected

**Verdict:** Confirmed for mixed-chain public-method inputs; partitioning fix adequate.

**Baseline:** [src/services/vaults/eVaultService/eVaultService.ts:235–271,343–352](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/eVaultService.ts#L235-L271) groups collateral addresses without chain identity and fetches them using `eVaults[0].chainId`. [src/services/vaults/eulerEarnService/eulerEarnService.ts:254–297,348–355](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eulerEarnService/eulerEarnService.ts#L254-L297) does the same for strategy vaults. These public array-taking methods do not accept a separate chain argument or declare a homogeneous-chain precondition.

**Authority:** The [original chain-specific vault lookup](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/vaults/eVaultService/eVaultService.ts#L264-L271) defines the required lookup identity; the strategy service uses the same chain/address contract. No onchain contract can make an address globally identify one vault across chains.

**Trigger/consequence:** A caller supplies a heterogeneous array; all addresses are fetched on the first chain. Identical addresses on different chains can attach that first chain's entity to another chain's parent. A normal single-chain `fetchVaults` flow does not itself demonstrate this bug.

**Fix/evidence:** Current population partitions parents by chain, preserves fetch options, runs each original single-chain flow, and combines diagnostics. The same-address chain-1/chain-10 regression checks attached identities. Adequate for the mixed-array mechanism, without attesting to deployed address inventories or external adapters that themselves return incorrect identities.

## Overall assessment

No D01–D15 item was wholly refuted at its narrowed scope. D09 and D10 should be presented as hardening/compatibility rather than ordinary production outages. D03, D08, and the downstream Pyth consequence of D14 require explicit configuration/deployment conditions. D01's snapshot correction is intentionally incomplete as a live preview; the separate exact-asset execution change addresses the identified redemption consumer. D05's retained balances do not make missing controller metadata known. D11 establishes consistency with existing SDK reward rules, not correctness of the reward economy.

The inspected fixes address their demonstrated mechanisms without a new confirmed defect found in this recheck. The verification consists of original/source comparisons, independent arithmetic, and deterministic mocked regression execution. It does not establish deployment reachability for every condition, complete data discovery, absence of all bugs, or a formal end-to-end proof.


---

# Independent recheck: swap, migration, and rewards

Rechecked the ten findings in `formal/integration/swap-migration-review.md`, in report order. The original SDK is commit `ff224741c251cae7673c5f835dcf3bbccd9d6605`; baseline line references below were read with `git show HEAD:<path>`, not inferred from the patched files. Local corrections were inspected separately. No production files were changed for this recheck, no transactions were sent, and no exploit or fund-transfer demonstration was built.

Verdicts distinguish a confirmed SDK defect from evidence that a deployed integration encounters its trigger. In particular, S02 is conditional compatibility hardening; S04/S05 are confirmed conditional unsafe configuration/quote acceptance, without a demonstrated fund-loss claim. S03's connector check partly duplicates existing connector defenses, while its centralized owner/chain checks add protection.

Sources read locally, at pinned revisions:

| Source | Revision |
| --- | --- |
| SDK | `ff224741c251cae7673c5f835dcf3bbccd9d6605` |
| Morpho Blue | `8e26ca6a8dbc5089edcd67fb576248810fd2870a` |
| Aave V3 Origin | `8305565ae342f1773c42cd2e4593f175fe5968a0` |
| EVC | `838e5f72eaea25fab7d242760245244226096054` |
| EVK | `bfb325a6e6ca09613d940b46f72ccfe017353933` |
| EVK periphery | `816c5943e5fab3a213e907dd5beaf9542305593a` |
| Euler Earn main, comparison checkout | `ea3dacc05f4003a1326815429d70d0c77f0dabb4` |
| Euler Earn dependency pinned by EVK periphery | `b2fd6e699ee20bcfe7459f375b3cee5d2fa53345` |
| Euler Lite | `fffb1cfcb964a236cc4e92e5d037c70ad1fd0207` |
| Data V3, read-only checkout | `fc9485fe2d7a38028871c59f2540118fe2a5c691` |

The OpenAPI snapshot used by the original review has SHA-256 `eb30fc696a5d90a15b1ca8ce0786abdf82480b423eb4cc418eeb64988279a8d9`. Source comparisons establish behavior at these revisions, not the bytecode or API revision running at every deployment.

## S01 — Morpho virtual shares/assets omitted

**Verdict: confirmed arithmetic mismatch; fixed for stored market totals.** Actual migration failure or excess borrowing remains state-dependent.

**Baseline and upstream.** SDK [morphoConnector.ts:1320–1326](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/positionMigrationService/connectors/morpho/morphoConnector.ts#L1320-L1326) computes ceiling(shares × assets / totalShares) and returns zero when either total is zero. Pinned Morpho [SharesMathLib.sol:20–43](https://github.com/morpho-org/morpho-blue/blob/8e26ca6a8dbc5089edcd67fb576248810fd2870a/src/libraries/SharesMathLib.sol#L20-L43) instead uses ceiling(shares × (assets + 1) / (totalShares + 1,000,000)). These are different formulas, independently of any SDK mock.

**Trigger and consequence.** With 500,001 borrow shares, two stored borrowed assets and 1,000,000 total borrow shares, the original SDK reports two assets while the library gives one. The connector reads `position` and stored `market` at [315–356](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/positionMigrationService/connectors/morpho/morphoConnector.ts#L315-L356), exposes that quantity as debt, and uses it to determine the buffered repayment/borrow amount at [514–531](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/positionMigrationService/connectors/morpho/morphoConnector.ts#L514-L531). Thus it is an execution-planning quantity, not only display metadata. The synthetic dust vectors establish the formula discrepancy; they do not establish the frequency of those exact states on live markets. No deployed loss or liquidation consequence was reproduced.

**Fix and limits.** The local helper adds both virtual offsets and rounds up; it matches the pinned library for the five regression vectors. It still reads stored totals. Morpho [repay:269–284](https://github.com/morpho-org/morpho-blue/blob/8e26ca6a8dbc5089edcd67fb576248810fd2870a/src/Morpho.sol#L269-L284) accrues interest before calculating its repayment, so this fix does not make the snapshot an authoritative current repayment quote.

**Tests.** `test/swapMigrationIntegration.test.ts:47` exercises the real connector with five controlled position/market results, including zero shares, dust and large values. The expected canonical result is checked against the upstream formula; this is neither an on-chain migration nor a proof that every synthetic state is reachable.

## S02 — Aave reserve with a zero stable-debt token

**Verdict: conditional compatibility hardening; a failure in a correctly configured pinned Aave Pool is not established.**

**Baseline and upstream.** SDK [aaveConnector.ts:342–402](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/positionMigrationService/connectors/aave/aaveConnector.ts#L342-L402) calls **Pool.getReserveData**, then unconditionally calls `balanceOf` on the returned stable-debt address in an `allowFailure:false` multicall. Pinned [Aave Pool.sol:455–459](https://github.com/aave-dao/aave-v3-origin/blob/8305565ae342f1773c42cd2e4593f175fe5968a0/src/contracts/protocol/pool/Pool.sol#L455-L459) returns the addresses-provider entry `MOCK_STABLE_DEBT` and explicitly requires a compatibility mock returning zero balances. In contrast, [AaveProtocolDataProvider.sol:244–257](https://github.com/aave-dao/aave-v3-origin/blob/8305565ae342f1773c42cd2e4593f175fe5968a0/src/contracts/helpers/AaveProtocolDataProvider.sol#L244-L257) returns `address(0)` from `getReserveTokensAddresses`. That is a different interface from the one the SDK calls.

**Trigger and consequence.** If the selected Pool actually returns zero, the extra balance read cannot decode a balance and the entire position read fails. The regression deliberately constructs that Pool result. Stable-debt deprecation and the DataProvider's zero return do **not** establish that normal calls to the pinned Pool return zero. No live Pool/address-provider configuration was checked. A missing mock configuration or another compatible Pool implementation could encounter the trigger.

**Fix and limits.** The local connector omits a stable-token read when its address is zero/absent and retains the nonzero path. This is a sensible narrow improvement. It does not repair arbitrary malformed reserve metadata or certify any Pool deployment. The original finding should not be presented as an Aave-wide outage or as proof of the actual DataProvider-to-SDK path.

**Tests.** `test/swapMigrationIntegration.test.ts:84` covers zero-token omission and the existing nonzero token path. Controlled provider data proves conditional behavior, not a historical or current deployment incident.

## S03 — Cached migration position not bound to its request

**Verdict: confirmed request-context validation defect; partly defense in depth.** The connector-ID part duplicates some existing connector checks; the combined finding is not a duplicate.

**Baseline and upstream.** SDK [positionMigrationService.ts:653–673](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/positionMigrationService/positionMigrationService.ts#L653-L673) immediately returns a supplied position. Authorization, building and simulation resolve it at [406–453](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/positionMigrationService/positionMigrationService.ts#L406-L453). The Morpho connector already rejects a wrong connector ID at [475–482](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/positionMigrationService/connectors/morpho/morphoConnector.ts#L475-L482), but then combines the requested owner/chain with cached market parameters, shares and collateral at [493–524](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/positionMigrationService/connectors/morpho/morphoConnector.ts#L493-L524).

**Trigger and consequence.** Reuse a position after changing account, chain or connector. The service previously allowed foreign/stale context to enter a new plan, potentially producing unsuitable amounts, markets, authorization prompts or a reverting transaction. It does not follow that the SDK can spend another owner's assets: pinned periphery [MigrationHelper.sol:40–60](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Swaps/MigrationHelper.sol#L40-L60) describes and implements binding to the EVC-authenticated sender, and [EVC:899–906](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L899-L906) authenticates calls. The test connector is a stub, so its zero-call assertion must not be described as proof that all built-in contracts previously accepted all mismatches.

**Fix and limits.** The local resolver checks normalized owner, chain and connector for both supplied and fetched positions before those service operations proceed. It prevents this context confusion, without proving freshness or consistency of every field inside `position.raw`; direct callers of connector classes remain responsible for the connector-level API contract.

**Tests.** `test/swapMigrationIntegration.test.ts:152` checks each of three mismatches through authorization, simulation and batch construction and asserts the stub connector was never called. This verifies the public service's preflight ordering.

## S04 — Empty swapper configuration skips allowlisting

**Verdict: confirmed conditional unsafe quote/configuration acceptance; practical fund loss is not established.**

**Baseline.** SDK [swapService.ts:351–372](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/swapService/swapService.ts#L351-L372) performs the canonical swapper check only if at least one usable configured address exists. Missing/all-zero configuration therefore permits arbitrary `quote.swap.swapperAddress` values through that check. Normal token/account/vault/amount binding at [314–349](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/swapService/swapService.ts#L314-L349) and nonzero configured verifier checks at [265–307](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/swapService/swapService.ts#L265-L307) still apply.

**Correction to the earlier report.** The exported [assertSwapQuoteContractsAllowed helper:47–85](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/swapService/swapAllowlist.ts#L47-L85) rejects an empty allowlist, but it is an opt-in helper. Searching SDK source found its definition, internal helper calls and exports, with no ordinary planner invocation. It is not evidence of mandatory downstream allowlist validation. For example, [encode.ts:1005–1047](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/encode.ts#L1005-L1047) forwards the quote's swapper destination/calldata and verifier destination/calldata. Its initial validation checks the operation's verification type, not the deployment allowlist.

**Actual transfer/allowance boundary.** In the wallet-funded deposit path, the SDK first invokes `transferFromSender(tokenIn, amount, quote.swapperAddress)` on the verifier. Pinned [MigrationHelper.sol:77–82](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Swaps/MigrationHelper.sol#L77-L82) binds the token source to `_msgSender()`. This helper uses **Euler Earn's periphery-pinned dependency** (`b2fd6e699ee20bcfe7459f375b3cee5d2fa53345`, verified from the periphery gitlink), [SafeERC20Permit2Lib.sol:35–50](https://github.com/euler-xyz/euler-earn/blob/b2fd6e699ee20bcfe7459f375b3cee5d2fa53345/src/libraries/SafeERC20Permit2Lib.sol#L35-L50): it spends sufficient, unexpired Permit2 allowance for the helper, otherwise calls token `transferFrom`. It is not an unconditional EVC allowance bypass.

For EVault shares, pinned [Token.sol:67–88](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/modules/Token.sol#L67-L88) calls `decreaseAllowance`; [BalanceUtils.sol:114–125](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/shared/BalanceUtils.sol#L114-L125) requires sufficient allowance unless the authenticated spender is the owner or the amount is zero. EVK's separate asset-pull helper [SafeERC20Lib.sol:27–42](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/shared/lib/SafeERC20Lib.sol#L27-L42) attempts Permit2 then ERC20 transferFrom; it does not grant the arbitrary swapper an approval. Vault-funded swaps instead encode an authenticated withdrawal to the quote swapper at [encode.ts:1119–1138](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/encode.ts#L1119-L1138); EVK [Vault.sol:218–231](https://github.com/euler-xyz/euler-vault-kit/blob/bfb325a6e6ca09613d940b46f72ccfe017353933/src/EVault/modules/Vault.sol#L218-L231) spends shares and checks withdrawal allowance before transferring the specified assets.

**Remaining mandatory checks.** A correctly configured verifier still checks its requested final condition: [SwapVerifier.sol:35–45](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Swaps/SwapVerifier.sol#L35-L45) checks available assets before skimming to the user; [74–82](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Swaps/SwapVerifier.sol#L74-L82) checks a transfer minimum; [91–98](https://github.com/euler-xyz/evk-periphery/blob/816c5943e5fab3a213e907dd5beaf9542305593a/src/Swaps/SwapVerifier.sol#L91-L98) checks remaining debt, with the contract's explicit maximum-value sentinel. Deadline checks also remain. A failed verifier call reverts the batch. These checks do not certify fair pricing or arbitrary intermediate calldata, but they materially limit impact. Arbitrary target acceptance alone is not proof of unrestricted access to other balances.

**Fix, trigger and tests.** Local `fetchSwapQuotes` now rejects empty canonical configuration; valid configured swapper routes still pass. The trigger requires missing/all-zero canonical swapper addresses, an otherwise valid fetched quote, and use of that quote. `test/swapMigrationIntegration.test.ts:263` tests acceptance/rejection at the quote service; its payload is synthetic and it does not execute asset transfers. The fix closes this fetch path, not raw quote construction by callers who bypass it.

## S05 — Zero verifier accepted as trusted

**Verdict: confirmed conditional unsafe quote/configuration acceptance; no fund-loss claim.** Separate from S04: one checks the swapper identity, the other checks whether the trusted postcondition target can exist.

**Baseline.** [swapService.ts:273–288](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/swapService/swapService.ts#L273-L288) checks truthiness of the configured verifier and then equality. A zero-address string is truthy. [swapAllowlist.ts:62–73](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/swapService/swapAllowlist.ts#L62-L73) has the same zero/zero acceptance. [swapVerification.ts:117–135](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/swapService/swapVerification.ts#L117-L135) verifies the encoded bytes, not that code exists at their destination.

**Trigger and static consequence.** Both configured and quoted verifier addresses must be zero; other quote checks must pass. Encoders forward the address. Pinned [EVC:832–869](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L832-L869) uses a low-level `targetContract.call(data)` without checking target code. Calling a no-code zero target does not execute the SwapVerifier's output, debt or deadline predicates. EVC caller authentication still applies at [899–906](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L899-L906), and EVK account/withdrawal checks are separate. Therefore a zero verifier must not be defended as “the contract call will necessarily revert.”

The practical outcome depends on the particular operation: wallet-funded `transferFromSender` is also sent to that zero target, whereas vault-funded encoders perform their withdrawal separately. This review records the skipped validator from static source only; no exploit or fund-transfer demonstration was built, and no deployed zero-verifier configuration was established.

**Fix and limits.** The local quote service and shared verifier guard explicitly reject zero configuration. This repairs those validation entry points. It does not perform deployment bytecode attestation or make arbitrary raw quotes safe. General raw-planner trust remains the caller's responsibility.

**Tests.** `test/swapMigrationIntegration.test.ts:275` checks both zero/zero helper rejection and fetched quote rejection with canonical swapper configuration. It verifies the client boundary, not execution of a malformed batch.

## S06 — CoW validates later plan items after earlier effects

**Verdict: confirmed execution-order defect for locally detectable invalid context; fixed preflight scope.**

**Baseline and upstream.** SDK [cowExecutor.ts:680–729](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/cowExecutor.ts#L680-L729) checks supported item types before execution, but checks each item's outer chain only inside the execution loop. A cancellation reads the current nonce at [378–391](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/cowExecutor.ts#L378-L391) and sends `setNonce` at [405–420](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/executionService/cowExecutor.ts#L405-L420). Actual [EVC.setNonce:324–337](https://github.com/euler-xyz/ethereum-vault-connector/blob/838e5f72eaea25fab7d242760245244226096054/src/EthereumVaultConnector.sol#L324-L337) is owner-gated and updates the namespace nonce; a later off-chain exception cannot revert an earlier successful transaction.

**Trigger and consequence.** A vector starts with a valid cancellation whose nonce has not already advanced, followed by an invalid-chain item. Previously the SDK could submit the cancellation before rejecting the later item. It could report failure after changing the user's order-cancellation state and incurring transaction cost. Nested parameter chain and owner were also not bound centrally. Wrong-owner cancellation is not a bypass of EVC ownership: EVC can reject it; the improvement catches it before earlier effects and unnecessary prompts.

**Fix and limits.** The entire CoW vector is checked for outer chain, parameter chain and owner before execution. It does not make multi-transaction execution atomic or preclude later RPC, signature, approval, orderbook or settlement failures. It also does not prove all nested wrapper/account fields valid.

**Tests.** `test/swapMigrationIntegration.test.ts:287` places a valid cancellation before each outer-chain, parameter-chain or owner mismatch and checks that read/send callbacks are never reached. The baseline control flow statically explains why the first invalid-outer-chain vector reached the cancellation. Provider receipts and sends are mocked; the test does not itself change an EVC nonce.

## S07 — Direct Merkl rows disagree with the claim planner

**Verdict: confirmed internal default-configuration mismatch; deployment-address correctness not established by this test.**

**Baseline.** [rewardsDirectAdapter.ts:1254–1290](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.ts#L1254-L1290) stamps every Merkl row with one configured distributor. The service contains overrides for chains 50 and 324 at [rewardsService.ts:186–198](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/rewardsService.ts#L186-L198), applies them only when using its standard default at [1025–1039](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/rewardsService.ts#L1025-L1039), then rejects a mismatching row target at [789–800](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/rewardsService.ts#L789-L800). [buildSDK.ts:472–540](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/sdk/buildSDK.ts#L472-L540) resolves a scalar `merklDistributorAddress` in `resolveRewardsDirectAdapterConfig`, and [1434](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/sdk/buildSDK.ts#L1434) supplies that adapter configuration to the service; it does not pre-apply per-chain overrides to direct rows.

**Trigger and consequence.** Direct Merkl data supplies a claimable, proof-bearing row on chain 50 or 324 while the SDK uses its default distributor scalar. The adapter's claim target differs from the planner's own supported-chain target, so `buildClaimPlans` throws `Merkl claim address mismatch`. Explicit matching custom configuration bypasses that internal disagreement. The strict downstream check prevents construction of a plan to the differing address; the observed effect is inability to plan the claim, not an incorrect successful payout.

**Fix and limits.** Both components now use `merklDistributor.ts`, with the pre-existing addresses/chain policy. Address normalization also avoids accidental case-sensitive disagreement. Unknown default chains still lack a trusted target and cannot be planned. This establishes consistency with the SDK's existing policy; neither this regression nor the supplied EVC/EVK/Morpho/Aave sources independently proves that those Merkl addresses have the correct deployed distribution code or live roots. No upstream Merkl deployment-source revision was supplied or claimed as verified.

**Tests.** `test/rewardsApyIntegration.test.ts:17` calls the actual direct adapter and service through claim planning for chains 1, 50 and 324, using default and custom configuration. The proof/address fixtures are synthetic, so “claimable” in the test title means a claim plan can be constructed, not that an on-chain claim succeeded.

## S08 — Intrinsic APY pagination truncation

**Verdict: confirmed integration defect under supported pagination overrides; pinned Data V3 response shape is fixed.**

**Baseline and upstream.** SDK [intrinsicApyV3Adapter.ts:125–158](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/intrinsicApyService/adapters/intrinsicApyV3Adapter/intrinsicApyV3Adapter.ts#L125-L158) allows oversized asset chunks and fetches one page per chunk. Full-chain [219–238](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/intrinsicApyService/adapters/intrinsicApyV3Adapter/intrinsicApyV3Adapter.ts#L219-L238) checks short-page length against the configured page size before consulting total. Actual Data V3 [response.ts:81–102](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/interface/http/utils/response.ts#L81-L102) caps page sizes at 100; [apys.ts:193–218](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/interface/http/routes/apys.ts#L193-L218) uses those parsed values and echoes total/offset/limit. This verifies that the first regression's server cap is a real source behavior.

**Trigger and consequence.** Configure page size 200, request a dataset of 150 rows, and receive the endpoint's first 100 rows. The baseline concludes that 100 < 200 is final and omits 50 entries. Oversized filtered chunks have an equivalent one-page omission. Defaults of page size 100 and maximum asset chunk 50 do not by themselves trigger the >100 configuration case. Missing APY entries affect read completeness and downstream display/fallback behavior; this is not a transaction amount or payout issue.

**Fix and limits.** The local adapter bounds page/chunk sizes to 100 and paginates both paths, honoring echoed page limits and explicit continuation flags. Its total handling is a **stop condition**: it does not force another request for a short response that supplies only `total` while omitting both `limit` and `hasMore`. For example, a custom server returning 20 rows with `{total:45}` after a request for 100 still looks short. Pinned Data V3 always echoes `limit`, so this does not invalidate the verified repair. The original report's blanket “honors total” claim needed narrowing; general custom-response completeness is not established.

**Tests.** `test/rewardsApyIntegration.test.ts:70` covers 150 assets, both filtered/full-chain, requested sizes 200 and cap 100. The test at `:114` covers an alternate server cap of 20 with echoed `limit` and 45 assets; that cap is a compatibility fixture, not the pinned endpoint's 100-row cap. No total-only custom-response regression was added during this recheck.

## S09 — Repeated reads of unpaginated reward APYs

**Verdict: confirmed source-to-source pagination mismatch; fixed for the pinned unpaginated endpoint.**

**Baseline and upstream.** SDK [rewardsV3Adapter.ts:525–542](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/adapters/rewardsV3Adapter/rewardsV3Adapter.ts#L525-L542) and campaign enrichment [559–599](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/adapters/rewardsV3Adapter/rewardsV3Adapter.ts#L559-L599) continue whenever a response contains at least 100 rows, absent a terminating total. Actual Data V3 [apys.ts:305–345](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/interface/http/routes/apys.ts#L305-L345) explicitly implements `/rewards` without pagination, reads no limit/offset, and supplies only chain metadata. [response.ts:129–144](https://github.com/euler-xyz/euler-data-v3/blob/fc9485fe2d7a38028871c59f2540118fe2a5c691/src/interface/http/utils/response.ts#L129-L144) omits pagination fields in that case. The missing metadata in the regression matches the actual route; it is not merely a malformed mock.

**Trigger and consequence.** A requested scope returns at least 100 reward-APY rows. The next offset is ignored by the endpoint, so the same complete response repeats until a request fails or execution is interrupted. If every request succeeds, the SDK loop has no terminating condition. This affects completion/request volume, not proof verification. For campaign enrichment, the >=100-row case is most directly relevant when breakdown rows omit vault identity and the SDK makes the unfiltered request; per-vault reads normally have fewer rows. This review did not establish a current live chain with >=100 returned rows.

**Fix and limits.** The local helper treats no pagination metadata as a complete response, in agreement with this route, and retains explicit `hasMore`, `total` and positive `limit` handling for custom paginated responses. It does not promise to recover pagination silently omitted by a different backend. Consistency of contradictory custom metadata is not established.

**Tests.** `test/rewardsApyIntegration.test.ts:149` returns 100 rows and deliberately throws on a second request. It checks both the chain reward map and no-vault campaign enrichment, including preserved token decimals. This bounded failure distinguishes the old loop from the new single call without an indefinite test. The separate test at `:182` preserves explicit `hasMore` pagination. No live server load test was run.

## S10 — Unresolved reward decimals replaced with 18

**Verdict: confirmed public metadata-contract violation; incorrect displayed values for live non-18 tokens are conditional.**

**Baseline.** SDK [rewardsServiceTypes.ts:69–79](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/rewardsServiceTypes.ts#L69-L79) already specifies optional decimals, omitted when unresolved. Direct [Brevis:1362–1375](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.ts#L1362-L1375), [Fuul claimable:1399–1424](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.ts#L1399-L1424), and [legacy Fuul:1447–1465](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/rewardsService/adapters/rewardsDirectAdapter/rewardsDirectAdapter.ts#L1447-L1465) supply 18 without resolved precision. The relevant independent contract is the SDK's existing public type documentation; no supplied on-chain source establishes all third-party reward token decimals.

**Trigger and consequence.** A reward row lacks decimals and a consumer treats the fabricated scale as authoritative. A six-decimal amount of 1,000,000 base units could display as 0.000000000001 instead of 1. No actual live non-18 reward/consumer combination was reproduced. Raw reward quantities and claim proof/signature payloads remain in base units; the fix does not change a payout amount.

**Fix and limits.** The local adapter leaves unknown precision absent, preserves explicit values including zero, and can fill a missing Fuul scale from a later same-token row. It does not independently read token decimals, validate all malformed provider metadata or reconcile contradictory reported scales.

**Tests.** `test/rewardsApyIntegration.test.ts:196` covers Brevis, legacy Fuul and claimable Fuul without precision, plus claimable Fuul with 0, 6 and 18, and asserts unchanged raw quantities. Its fixtures are synthetic. The later-row aggregation branch was inspected in source but is **not** separately exercised by that named test, which supplies one claimable row per precision case.

## Validation and interpretation

Fresh recheck run on the local corrections:

```sh
pnpm -C packages/euler-v2-sdk exec vitest run \
  test/swapMigrationIntegration.test.ts test/rewardsApyIntegration.test.ts
```

Result: **12 tests passed across two files; no type errors reported** (2026-09-23, 15:02 local command timestamp). No production edits were made after this run by this reviewer. The parent review records the broader suite and formal checks separately.

Original-behavior evidence in this recheck is the exact `git show HEAD` control flow and upstream comparisons above. The original implementation review records regressions failing before its patches; this recheck does not independently claim a second completed baseline runtime run. An attempted isolated baseline rerun entered package-manager dependency setup and was stopped after network-resolution failures, before tests executed. That setup failure is not evidence for or against a finding. The already completed local 12-test run is the runtime result reported here.

These tests cover all ten report items, but several grouped tests stop at their first failed assertion on the original code. A test name or mock count alone does not establish every subcase, a deployed incident, end-to-end asset safety, or completion of a live reward claim. No Lean/TLA+ result is being extended to these swap, migration, reward-provider or deployment behaviors.


---

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
