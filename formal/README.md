# Local SDK verification

This directory verifies selected properties of batch composition, EVault share
arithmetic, and materialized execution. It does **not** certify the entire SDK,
its TypeScript runtime, wallets, RPC providers, or deployed contracts.

See the [integration review](integration/REVIEW.md) for the subsequent full SDK
source inventory, cross-repository findings, corrections and remaining gaps.
Run `pnpm verify:integration` for the recorded inventory and focused integration
regressions; Lean/TLA verification remains scoped as described below.

## Run

From the repository root, install the locked development dependencies:

```sh
pnpm --filter @eulerxyz/euler-v2-sdk install --frozen-lockfile --ignore-scripts
```

Install Lean **4.19.0** using [Lean's installation instructions](https://lean-lang.org/install/).
The project pins `leanprover/lean4:v4.19.0` in `lean/lean-toolchain`; with elan
installed, `elan toolchain install leanprover/lean4:v4.19.0` installs that version.
Install Java (the checks were exercised with Temurin 21), then download the
checksum-pinned **TLA+ tools 1.7.4** distribution (TLC) locally:

```sh
pnpm setup:tlc
pnpm verify:formal
```

`setup:tlc` writes only to the ignored `formal/.tools` directory. The verification
runners download no project dependencies; an elan-managed `lake` can install a
missing pinned Lean toolchain. To use existing portable
tools, set `LAKE` to the `lake` executable, `JAVA` to the Java executable, and
`TLA2TOOLS_JAR` to the checker JAR. All three are optional when the tools are
available at their documented default locations. A missing tool, wrong Lean
version, wrong checker checksum, proof error, stale oracle fixture, unexpected model
result, or failed SDK test makes verification fail.

Individual commands:

| Command | Checks |
| --- | --- |
| `pnpm verify:lean` | Lean theorems, transitive axiom audit, freshly evaluated arithmetic corpus against the checked-in fixture |
| `pnpm verify:tla` | Exhaustive finite TLC models, deliberately broken guard controls, and reachable success/failure paths |
| `pnpm verify:formal:tests` | Actual SDK composition, arithmetic, materialization and execution tests; uses the committed Lean corpus without requiring Lean or Java |
| `pnpm -C packages/euler-v2-sdk test` | Complete SDK test suite, including the new correspondence tests |
| `pnpm -C packages/euler-v2-sdk typecheck` | SDK TypeScript check |

The complete SDK suite includes existing network and local HTTP-server tests.
The focused verification tests require neither network access nor a wallet.
TLC may require permission to open its local management socket in a sandbox.

## What is established

| Area | Specification and implementation connection | Limits |
| --- | --- | --- |
| Batch composition | Lean proves regrouping ordered calls preserves the reference state-transition fold. Generated TypeScript checks require `mergePlans` to preserve the exact flattened calls, contexts, values, order and operation metadata. | The proof describes one common batch boundary. Merging separately executable plans changes transaction and deferred-status-check boundaries. It is not proof that separate transactions and one merged transaction are interchangeable. |
| EVault arithmetic | Lean proves rounding bounds, monotonicity, minimal sufficient withdrawal shares, zero behavior and both non-inflating round trips. TypeScript calls the actual EVault methods against outputs evaluated by Lean. | Natural-number inputs, fixed snapshot, positive adjusted totals and unbounded products. No claim about Solidity overflow/reverts, evolving exchange rates, arbitrary ERC4626 vaults, oracle accuracy or all SDK risk math. |
| Materialized execution | TLC explores requests, signatures, receipt success/failure, hooks, rejection, interruption, unknown broadcast outcomes and optional nonce checks. SDK tests inject failures and compare observable execution boundaries. | Finite sizes listed in the TLA runner; one invocation, trusted input artifacts and callback interfaces. No unbounded implementation refinement proof, cross-invocation retry guarantee, CoW settlement model, chain finality or eventual completion guarantee. |
| Materialization integrity | Generated SDK cases vary batches, signature slots and signature lengths, checking request identity, call order, value, input immutability and preservation of every non-signature call. | Tests rather than a proof of ABI encoding or signature validity. Variable-length signatures can change ABI offsets; decoded call preservation is the meaningful guarantee. |

See [Lean details](lean/README.md) and [TLA+ details](tla/README.md) for statements,
model-to-source mappings, assumptions and checked negative controls.
See [the local review record](REVIEW.md) for the changes and completed validation.

## Production change and review implications

`mergePlans` previously cancelled opposing collateral transitions and removed
repeated collateral/controller transitions. It inferred the action from calldata
selectors without proving the destination or considering the starting state,
intervening calls, authorization, events or scheduled status checks.

For example, on an account with collateral already enabled and no debt,
`enableCollateral; disableCollateral` leaves it disabled. Removing both calls
leaves it enabled. A regression preserves this counterexample, while the Lean
reference model makes the invalid equivalence explicit.

The fix preserves every call. It also keeps named-operation metadata, including
empty groups. Approval requirements continue to be aggregated and their prior
resolutions cleared. Direct contract-call and CoW plan items remain unsupported
by `mergePlans`.

This can increase merged calldata and gas compared with the old optimizer.
It can also expose reverts that the optimizer previously suppressed. Those are
intentional consequences of retaining requested behavior. Re-simulate merged
plans; callers that need fewer transitions must construct them using the relevant
state and contract semantics. Raw call objects retain the SDK's existing shallow
sharing behavior; the composition function does not mutate its inputs.

## Keeping the specifications connected

When changing the implementation, review the corresponding specification and
run `pnpm verify:formal`. The Lean checker audits the proof dependencies against
the standard foundational axiom allowlist, rejecting `sorryAx` and custom axioms.
It freshly evaluates the arithmetic oracle and requires byte-for-byte fixture
agreement. Regenerate intentionally with `node formal/lean/check.mjs --write-fixture`
and review the changed corpus if the specification changes.

TLC checks include deliberately invalid guards that must produce the named
counterexamples. It also checks that completion and unknown-broadcast states are
reachable. These controls reduce the risk of an invariant passing because its
interesting states cannot be reached. The nonce-race control demonstrates why a
successful preflight nonce read cannot guarantee the nonce remains current while
the wallet prompt is open.

The TypeScript tests are implementation correspondence evidence, not a formal
proof that all JavaScript executions refine the Lean or TLA+ specifications.
The verification runners are local commands and are not connected to publishing,
deployment or a remote CI workflow.
