# SDK integration review — local results

Completed review of the Euler V2 SDK starting from freshly fetched `main`, commit `ff224741c251cae7673c5f835dcf3bbccd9d6605`, on 2026-09-23. The supplied repositories and V3 API documentation exposed additional bugs beyond the initial batch-composition finding. Corrections, regressions and verification artifacts remain local and uncommitted. Nothing was pushed or deployed.

**This is not a bug-free certification.** Every SDK source file received an assigned review, and the fixes have executable regression coverage. That does not establish exhaustive path coverage, deployed-code identity, or correctness of all wallets, RPCs, indexers, oracle data and external protocols.

**Recheck correction:** [the finding-by-finding source recheck](recheck/README.md) supersedes the original severity, reachability and completeness claims below. It distinguishes original-main defects from intermediate local changes and defensive validation. In particular, the original Earn 1:1 preview could over-redeem or revert; the previously cited 966,942-asset shortfall belonged to an intermediate snapshot-preview change. The Aave zero-address case is conditional, and mint approval remains an estimate even after rounding up. See the recheck for the corrected allowance-route behavior and all individual verdicts.

## Most consequential findings

| Priority for review | Confirmed behavior before correction | Local result |
| --- | --- | --- |
| Requested withdrawal amount | Original EulerEarn inherited a 1:1 assets-to-shares preview, so an asset request could redeem too many shares/assets or revert. A subsequently added snapshot preview omitted pending fee shares and could instead underdeliver; that was an intermediate local regression, not the original example. | Earn asset requests now use onchain `withdraw`, which enforces the requested amount. Explicit-share redemption remains available. Snapshot display conversions still have the limits below. |
| Hidden debt and incomplete accounts | V3 unknown debt/balances became zero; absent optional metadata erased positions; failed discovery became an empty success. | Unknown critical balances trigger fallback, available positions survive missing metadata, and failed discovery is reported. |
| Execution and simulation boundaries | Permit2 signatures could be dropped; invalid later plan items could be detected after earlier effects; separate EVC transactions were simulated as one atomic batch; malformed results could appear successful. | Whole-plan validation, preserved signatures/call order, explicit rejection of unsupported boundaries, and strict simulation-result checks. |
| Oracle checks | EVC-only state changes and reverse CrossAdapter routes could miss required price updates; failed read-time updates could be hidden behind a successful lens read. | Correct route/check discovery, complete prepend validation and visible fallback diagnostics. |
| Cross-chain/context errors | Cached accounts, wallets and migration positions could be used with mismatched requests; mixed-chain population could attach another chain's vault data. | Identity checks before effects and grouping reads by chain. |
| Migration/rewards math and availability | Morpho conversion omitted virtual shares/assets; Merkl read and claim paths disagreed about distributor addresses; unpaginated rewards could loop forever. Aave zero-address handling is conditional compatibility hardening, not a demonstrated failure of the pinned Pool implementation. | Contract-derived rounding, guarded Aave reads, shared Merkl target resolution and corrected pagination. |
| Shared infrastructure | Slow older requests overwrote newer cached data; saturated zero-debounce batching could starve I/O; invalid batch sizes could stop progress. | Completion ownership checks, capacity-driven dispatch and early parameter validation. |

These are correctness/reliability findings and defensive improvements, not a list of independently demonstrated fund-loss exploits. Swapper/verifier checks were strengthened at quote intake. The optional exported assertion was not generally invoked by built-in planners; a configured nonzero verifier provides an output/debt postcondition, which is a different safeguard. The recheck preserves those distinctions.

## Complete findings and scope

All findings, affected paths, regressions, compatibility changes and residual assumptions are retained in four reports:

- [Execution, approvals, simulation and EVC](execution-review.md): 14 grouped corrections, including the original batch bug and the Earn exact-asset fix.
- [Accounts, vaults, pricing, portfolios and oracle routes](data-review.md): D01–D15.
- [Swaps, migrations, CoW, rewards and APY](swap-migration-review.md): ten grouped corrections.
- [Plugins, request infrastructure and supporting services](infrastructure-review.md): eleven grouped corrections. Its EVC-only Pyth entry refers to the execution discovery finding; groups overlap and should not be summed as independent vulnerabilities.

[coverage.json](coverage.json) inventories **all 189 SDK TypeScript source files**, including 79 supporting interface/export files, with hashes identifying the reviewed local content. The inventory checks for omitted, unknown, duplicate and changed entries. It is file inventory coverage, not a line/branch coverage score. The scope is the SDK's `src` tree and its tests/contracts; example applications and every downstream use are not independently audited.

[sources.json](sources.json) records exact source revisions, the full V3 OpenAPI document hash, and the additional EulerEarn/Morpho/Aave sources used. [v3-schema-excerpt.json](v3-schema-excerpt.json) preserves relevant API definitions. Euler Lite's reviewed checkout declares SDK version 3.3.0; its consumer source is useful context, not evidence that a published package is identical to SDK main.

## Validation

| Check | Result |
| --- | --- |
| Complete SDK suite | **1,277 tests passed in 57 files**, using its normal timeout; no reported type errors |
| Focused integration suite and reviewed-source hashes | **291 tests passed in 19 files**; inventory matches all 189 source files |
| SDK build and separate TypeScript check | Passed |
| Lean | **29 theorems**, transitive axiom audit passed; **497** freshly evaluated oracle rows matched |
| TLA+ | **15** expected model results: eight finite positive configurations and seven negative/reachability controls |
| Formal SDK correspondence suite | **544 tests passed** in five files |
| Actual upstream EVC Solidity fixture | **4 tests passed** in Forge's local EVM after the source recheck |
| Compiled EVC ABI comparison | **44/44** SDK function signatures, return types and mutability matched pinned source |
| Lens struct comparison | 21 structs / 59 tuple occurrences: field names and order only; Solidity types/widths are not checked by this script |
| Source inventory and whitespace checks | Passed |

Focused integration results and reproducible commands are recorded alongside each report; `pnpm verify:integration` reruns the combined focused regressions and source inventory. Existing rewards tests can make real provider requests: one intermediate agent run hit an unchanged Turtle test's five-second deadline, and passed with 30 seconds. The final full-suite run above passed at the ordinary deadline. No live transaction or full production-chain fork matrix was run. Forge's initial online signature lookup hit a macOS proxy-library crash; its offline contract run passed.

Independent cross-review of the combined fixes found and corrected the tokenlist compatibility case: `disableV3` disables the built-in V3 source while preserving explicit custom URL functions/templates. The execution fixes also received a separate source review. These reviews add evidence; they are not formal proofs.

## Remaining guarantees the SDK cannot currently make

1. **Snapshots are not live execution quotes.** Earn entity conversions/fallback display prices still omit unminted fee shares because current lens/API snapshots omit the necessary coherent inputs. The dangerous asset-transfer planning case is fixed. Morpho stored market totals omit pending interest. Even exact contract previews can move before inclusion; execution-time contract enforcement remains necessary.
2. **Simulation success is conditional.** It can use synthetic balances, allowance/storage overrides and best-effort reads. It does not establish real gas funding, complete account discovery, wallet signatures, future oracle freshness, or the absence of changes before inclusion. Multiple EVC transaction boundaries are rejected; independent direct-call simulations require actual independence.
3. **External and concurrent state remains outside the proof.** Outstanding CoW orders can share a namespace/nonce, authorization can change while a wallet prompt is open, standing migration permissions require the application's intended revocation policy, and submission is not settlement. Deployed wrapper bytecode and every proxy/storage layout were not independently verified.
4. **Data can be incomplete.** Subgraph/indexer discovery can lag or miss standalone deposits; some USD aggregates are partial when prices are unavailable. Consumers must preserve diagnostics. Securitize enumeration is unsupported and its existing factory accessor is hardcoded without a general chain-specific deployment source; it must not be treated as universal discovery.
5. **Formal scope stays narrow.** Lean proves the stated integer/call-composition models; TLC exhaustively checks the configured finite executor models. Regression tests connect selected implementations to those models. This is not an end-to-end proof of TypeScript, EVM contracts, arbitrary tokens/hooks, remote services or every SDK path.

## Reproduce locally

```sh
pnpm --filter @eulerxyz/euler-v2-sdk install --frozen-lockfile --ignore-scripts
pnpm --filter @eulerxyz/euler-v2-sdk test
pnpm --filter @eulerxyz/euler-v2-sdk build
pnpm --filter @eulerxyz/euler-v2-sdk typecheck
pnpm verify:integration
pnpm verify:formal
```

The formal tool setup is in [../README.md](../README.md). EVC compilation/fixture and ABI-check instructions are in [execution-review.md](execution-review.md). Review source changes before deliberately regenerating inventory hashes with `node formal/integration/check-coverage.mjs --write`.

Review compatibility changes before adopting the patch: errors previously swallowed can now stop preparation, unsupported transaction/Permit2 shapes fail early, invalid batching options are rejected, wallet zero balances incur an extra verification read, and Earn asset-denominated `planRedeem` encodes `withdraw`. No dependency versions, lockfiles, remote branches or deployment configuration were updated.
