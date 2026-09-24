# Source recheck of every previously reported finding

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

Read [all 50 entries in one document](FINDINGS.md), or use the four focused reports below.

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
