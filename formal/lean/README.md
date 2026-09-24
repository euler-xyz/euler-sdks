# Lean proof project

This project uses **Lean 4.19.0**, with only the bundled standard library. There
is no Mathlib or other external package dependency. `lean-toolchain` pins the
release; `check.mjs` rejects a different version.

## Run

From the repository root, with the pinned `lake` available:

```sh
node formal/lean/check.mjs
pnpm --filter @eulerxyz/euler-v2-sdk exec vitest run test/evaultArithmeticFormal.test.ts
```

An isolated toolchain is also supported; set `LAKE` to its executable path:

```sh
LAKE=/path/to/lean-4.19.0/bin/lake node formal/lean/check.mjs
```

The first command builds the proofs, audits each theorem's transitive axiom
dependencies, runs the Lean oracle, and requires an exact match against
`oracle.json`. It fails if the toolchain is missing, a proof fails, an unexpected
axiom appears, or the fixture is stale. The only permitted foundational Lean
axioms are `propext`, `Classical.choice`, and `Quot.sound`; `sorryAx` is rejected.

The oracle runs using `lake env lean --run Oracle.lean`, so it does not depend on
a host C compiler or native executable linker. To intentionally update the
checked-in fixture after reviewing a specification change:

```sh
node formal/lean/check.mjs --write-fixture
```

The ordinary TypeScript tests use the checked-in fixture and do not require a
Lean installation. A complete formal verification run must also execute the
Lean checker; ordinary fixture tests alone cannot establish fixture freshness.

## Arithmetic guarantees

`EulerArithmetic.lean` defines the actual floor and ceiling formulas used by
`EVault.convertToShares`, `EVault.convertToAssets`, and `EVault.previewWithdraw`.
The virtual deposit is exactly **1,000,000** in both totals.

For every natural-number snapshot and amount, the kernel-checked theorems show:

- Both adjusted totals are strictly positive, even for an empty vault.
- Floor rounding is at most the exact rational result and loses less than one
  integer unit; ceiling is sufficient and adds less than one integer unit.
- All three conversion functions are monotone in their input amount.
- The computed withdrawal shares are **exactly the minimum** shares whose
  floor-rounded asset conversion meets the requested amount.
- A floor-rounded assets-to-shares-to-assets round trip cannot create assets;
  the corresponding shares round trip cannot create shares.
- All three conversions return zero for zero input.

These are mathematical results for all inputs in the stated domain, not an
enumeration of small examples. `oracle.json` provides a separate, finite bridge
to the production TypeScript implementation: **497 cases** compare all three
real EVault methods to results computed by Lean from these proved definitions.
The tests also check the theorem consequences directly against those methods.

The corpus includes every combination of totals 0–4 and amount 0–8, plus 16
large or imbalanced snapshots and 17 boundary amounts: the virtual deposit,
JavaScript's safe-integer limit, 18-decimal token units, and values up to
`2^256 - 1`. All values are decimal strings in JSON. Some mathematical stress
cases and their results exceed valid on-chain ranges; they establish bigint
behavior, not that those states or transactions are permitted by an EVault.

## What this does not prove

- The TypeScript compiler, JavaScript runtime, or EVault implementation as a
  whole is not formally verified. The Lean-to-TypeScript connection is finite
  differential testing; the proof applies directly to the Lean definitions.
- Inputs are nonnegative integers and both conversions in a round trip use the
  **same snapshot**. Negative bigint inputs, mutable live totals, fees, interest
  accrued between reads, liquidity, withdrawal permissions, and oracle prices
  are outside these arithmetic theorems.
- Natural-number arithmetic is unbounded, matching the formulas' bigint
  operations. Solidity numeric bounds, revert conditions, and actual contract
  execution are not proved here. Withdrawal sufficiency means arithmetic
  conversion sufficiency; it does not guarantee a withdrawal can execute.
- Basic ceiling theorems require a positive denominator. The public conversion
  theorems discharge that requirement with the positive virtual deposit.

## Batch composition

`BatchComposition.lean` separately proves properties of composing an ordered
call sequence under its explicit abstract execution semantics, and records a
counterexample to cancelling opposing collateral transitions. These proofs do
not model all EVM behavior. The SDK batch tests supply the connection to actual
encoded output; unchanged call order and multiplicity are the preservation
boundary. Consult that module for its exact assumptions and theorem statements.
