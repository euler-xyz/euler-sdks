# Initial local verification review

Completed on 2026-09-23, starting from freshly pulled `main` at
`ff224741c251cae7673c5f835dcf3bbccd9d6605`. Changes remain local and uncommitted.

This records the initial formal-verification pass. The subsequent broader
[integration sweep](integration/REVIEW.md) adds production fixes and supersedes
these initial test totals. Its source review does not expand the Lean/TLA proof scope.

## Production fix

`ExecutionService.mergePlans` now preserves every call instead of cancelling
opposing collateral transitions and deduplicating repeated collateral/controller
transitions. The old rewrite could change initial-state-dependent behavior and
observations by intervening calls; it also recognized function selectors without
establishing the target contract's semantics.

The regression includes initially enabled collateral with `enable; disable`:
the original sequence ends disabled, while removing both leaves it enabled.
There is also a proved counterexample where the final flags agree but an
intermediate observation differs. These are reference/source-level results,
not an exploit reproduced against a deployed contract.

Call order, context, calldata, value and operation metadata are preserved.
Approval aggregation and rejection of unsupported execution boundaries remain.
Preserving calls may increase gas/calldata or expose previously suppressed
reverts. Merging still combines transaction/status-check boundaries, so the
merged plan requires simulation; it is not equivalent to executing independent
transactions. No arithmetic or executor production changes were needed in that initial pass;
the subsequent integration sweep did require both.

## Verification delivered

- **29 Lean theorems:** 21 arithmetic and 8 ordered-composition results.
  The runner audits transitive axiom dependencies and rejects custom axioms
  and `sorryAx`.
- **497 freshly evaluated Lean oracle rows:** compared with actual EVault
  conversion methods, including empty, imbalanced, safe-integer-boundary and
  uint256-scale inputs.
- **15 TLC scenarios:** eight exhaustive positive finite configurations and
  seven expected-counterexample controls. Negative controls exercise broken
  receipt/signature/order/completion guards, nonce races, reachable completion
  and ambiguous broadcast outcomes.
- **Batch correspondence:** 1,555 action sequences, 7,465 merge partitions,
  and 12,440 abstract traces across eight initial-state combinations, plus
  targeted call-context, metadata, approval and boundary regressions.
- **Materialization integrity:** 36 generated shapes compare original plans,
  materialized requests and finalized calls, including variable signature
  lengths and independently checked request/slot counts.
- **Executor correspondence:** 24 shapes with individual boundary failures
  and receipt reverts, plus awaited-promise, nonce-drift and ambiguous-broadcast
  tests against the actual executor.

Positive model sizes from the completed run:

| Configuration | Generated states | Distinct states |
| --- | ---: | ---: |
| Prerequisites and two signatures | 1,718 | 849 |
| Already finalized | 1,631 | 824 |
| Nonce validation disabled | 2,452 | 1,231 |
| First request signed | 1,382 | 691 |
| Two prerequisites, two slots | 2,638 | 1,319 |
| Unsigned requests | 147 | 81 |
| Empty plan | 27 | 15 |
| Empty finalized plan | 16 | 9 |

These counts describe the chosen models, not numbers of verified real-world
transactions. The modeled bounds are 0–4 requests and 0–2 signature slots in
the specific configurations listed by the runner.

## Completed checks

| Check | Result |
| --- | --- |
| `pnpm verify:formal` | Passed: Lean, TLC and five SDK correspondence test files |
| Focused correspondence suite | 543 tests passed |
| Complete SDK suite | 1,208 tests passed across 51 files; no type errors |
| SDK build | Passed |
| SDK typecheck | Passed |
| `git diff --check` | Passed |
| TLC setup | Download/checksum verification and subsequent cache reuse passed |
| Lean checker failure controls | Disposable copies with a stale fixture, custom axiom and `sorry` theorem were each rejected |

Tools: Lean 4.19.0; TLA+ tools 1.7.4 (TLC2 2.19); Temurin Java 21;
Node 22.21.1; Vitest 4.1.5. The full SDK suite needed network access and a local
HTTP server for its existing tests. TLC needed its local management socket.

One additional full-suite run timed out at five seconds in the pre-existing
`direct rewards adapter maps Fuul lend and looping incentives` test (1,207
other tests passed). The unchanged test passed in isolation in 892 ms, and the
final full-suite recheck passed all 1,208 tests across 51 files. It mocks
Fuul but leaves other reward sources enabled; the whole-suite pass should not
be interpreted as evidence that these existing external dependencies are
deterministic. The new focused verification tests are independent of them.

For the portable runtimes already downloaded during this session, the verified
command was:

```sh
LAKE=/private/tmp/euler-sdk-formal-tools/lean-4.19.0-darwin_aarch64/bin/lake \
JAVA=/private/tmp/euler-sdk-formal-tools/jdk-21.0.12.1+1/Contents/Home/bin/java \
pnpm verify:formal
```

The temporary runtimes may be removed by the operating system. For a lasting
setup, follow [the installation and run instructions](README.md). The downloaded
TLC checker is in ignored `formal/.tools`; no tool binaries enter the review diff.

## Assurance boundary

The Lean statements are proofs of the reference definitions. TLC checks finite
execution models. Generated tests connect those definitions/models to the SDK;
they are not a formal proof of the TypeScript implementation. Full EVM semantics,
Solidity overflow/reverts, concurrent invocations, automatic recovery, CoW order
settlement, oracle correctness and chain finality are outside this suite.

In particular, successful nonce validation cannot reserve a nonce through a
wallet prompt. The model intentionally finds that race; the SDK test confirms
the execution stops if the resulting transaction reverts. It does not claim to
eliminate the race or make retrying an ambiguous broadcast safe.
