# Materialized execution safety model

This directory checks a finite TLA+ model of `executeMaterialized` in
`packages/euler-v2-sdk/src/services/executionService/materializedExecution.ts`.
It also checks deliberately broken variants. This is model checking plus tests
against the real TypeScript implementation; it is **not** a proof that the
TypeScript refines the model, or a verification of wallets, RPC services,
Permit2, EVC, CoW settlement, or the entire SDK.

## Run locally

Install repository dependencies and a Java runtime (tested with Java 21), then:

```sh
pnpm setup:tlc
pnpm verify:tla
pnpm -C packages/euler-v2-sdk exec vitest run test/materializedExecutionModel.test.ts
```

`JAVA=/absolute/path/to/java` overrides the Java executable.
`TLA2TOOLS_JAR=/absolute/path/to/tla2tools.jar` overrides the downloaded jar.
The runner verifies its SHA-256 before execution:

```text
Release: https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4
Asset:   https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar
SHA256:  936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
```

The distribution is TLA+ 1.7.4; its TLC banner identifies TLC2 version 2.19.
Checks use one worker and a fixed seed. Each configuration is exhaustively
explored, with no depth bound, state constraint, or fairness assumption.
The runner prints generated/distinct state counts and the temporary directory
containing all `.cfg` files, full logs, counterexample traces and `results.json`.
It rejects unexpected failures, timeouts, missing tools, changed jars and
negative controls that unexpectedly pass. Expected invariant violations are
successful *controls*, never successful verification of the false property.

TLC opens a local Java management socket; execution environments that deny
local sockets need to allow this. No remote service is needed to run the checks
once the jar/runtime and SDK dependencies are available.

`MaterializedExecution.cfg` is a standalone representative configuration. The
runner generates the full scenario set from its reviewable case table.

## Specification and implementation boundary

The model starts with a structurally valid materialized request vector. Supplied
already-finalized inputs are trusted, as required by the SDK's public contract.
Their authenticity, chain/account binding and review acceptance belong to the
application; this model does not establish them.

| Model | Actual executor behavior |
| --- | --- |
| `initialNonce` | Optional pinned-nonce checks before prerequisites, or before an already-finalized execution |
| `route` / `FirstSigned` | Static prerequisites before the first request needing a signature; finalized vectors start at request zero |
| `signatureProgress`, `signatureNonce`, `beforeSignature`, `sign` | Signature progress callback, optional nonce read, awaited boundary hook, wallet signature |
| `finalize`, `finalizedHook` | Insert all collected signatures; await `onFinalized` |
| `stepNonce`, `beforeStep`, `transactionProgress`, `send` | Optional nonce checks for slots in the request, awaited `onBeforeStep`, progress callback, transaction wallet call |
| `hashHook`, `receipt` | Await `onTransactionHash`, then poll receipt; revert and polling error stop the run |
| `afterStep`, `afterProgress` | Await `onAfterStep`, emit progress, then advance |
| `completeProgress` | Emit `status: "completed"` only after every successful receipt and after-step hook |

TLA+ indices start at **one**; SDK `requestIndex` and slot indices start at
**zero**. Request addresses/data/signature bytes and cryptography are abstracted
away. The model retains dispatch order, receipt and hook history, signature
availability, finalization and nonce-check history. Receipt success is an
external observation, not a proof of irreversible chain finality. Different
failure messages collapse many concrete errors into the same stop behavior.

Every hook and progress callback may throw. Wallet signing can reject;
transaction sending can return a hash, reject before forwarding, or reject
after it might have forwarded the transaction. Receipt polling can succeed,
report a revert or fail with unknown chain outcome. Interruption stops client
progress without undoing any possible broadcast. These are safety abstractions:
there is no assumption that a pending wallet/RPC promise eventually resolves.
Stuttering allows indefinite waiting; no liveness result is claimed.

Nonce changes may occur between any transitions. The abstraction records only
whether each pinned value has changed; no numeric nonce bound is needed. It
does not infer a valid on-chain permit from a passed client-side check.

## Properties checked

- `RequestOrder`: dispatch indices are exactly the initial prefix of the vector,
  with no skip, duplication or reordering within one invocation.
- `PrerequisiteSuccess`: every earlier request has a successful receipt before
  any later request is dispatched.
- `HookGate`: every earlier request's after-step hook has succeeded before the
  next dispatch.
- `SignaturesBeforeSignedCalls`: all declared signatures, finalization and its
  hook precede the first signed request and all following dispatches.
- `CompletedOnlyAfterSuccess`: final completion requires all requests' success
  receipts and after-step hooks, including well-defined empty-plan behavior.
- `NonceChecksBeforeDispatch`: when enabled, all slots used by a request were
  checked before that request's dispatch. This deliberately says **checked**,
  not that the nonce remains unchanged afterwards.
- `TypeOK`: counters, signature sets and receipt/hash relationships remain in
  the expected domains.

The positive cases cover 0–4 requests and 0–2 signature slots: prerequisites
with two later signed requests, already-finalized input, validation disabled,
two signatures in the first request, two prerequisites then two signatures in
one batch, unsigned requests, empty input and empty finalized input. Claims
are limited to these explicit bounds/configurations, not arbitrary vector sizes.

## Non-vacuity and counterexamples

Four deliberately wrong transitions separately bypass receipt gating, bypass
signature collection, dispatch out of order and claim completion early. Each
must violate its named invariant; a syntax/runtime failure does not count.

Two reachability controls deliberately assert that completion or an ambiguous
broadcast is impossible. TLC must find both paths, so passing safety checks
cannot be explained by an executor that never reaches useful behavior.

`NonceStillPinnedAtDispatch` is a deliberately false stronger guarantee. Its
counterexample passes nonce validation, changes that nonce before dispatch,
then dispatches. A nonce check is a snapshot, not a reservation or atomic lock.
The matching TypeScript test changes the mocked nonce in `onBeforeStep`, then
returns a reverted receipt and verifies that the next request is not sent.
Adding another client-side read would move, but would not eliminate, this race.

Similarly, a rejected send promise does not prove nothing was broadcast, and a
throwing hash/after-step hook does not undo the transaction. Retrying the whole
vector after these failures needs application-level reconciliation. The model
does not check repeated invocations, concurrent executors, reorgs, resumability,
nonce consumption semantics, byte-level signature insertion or order settlement.
The numeric `onProgress.completed` field counts collected hashes during
execution; the completion invariant concerns `status: "completed"`, not an
interpretation of that counter as a count of confirmed receipts.

## Connection to the TypeScript implementation

`materializedExecutionModel.test.ts` creates 24 materialized/finalized shapes,
with and without revalidation. Each success run checks order, receipt gating,
hook gating, signatures, finalization, exact dispatched request contents and
completion against actual SDK calls. Every reached external boundary, hook and
progress callback is then independently failed; the observed trace must stop
at that exact prefix. Each transaction is also independently reverted.

Additional tests hold promises unresolved to check that hooks and receipts are
actually awaited, change the nonce at each read, reproduce the nonce snapshot
race, and simulate a send error after forwarding. There are 28 named tests;
the generated boundary-failure and revert cases run inside these tests. These
tests constrain specification drift without claiming exhaustive TypeScript
verification. Keep the mapping and generated cases current if the executor's
control flow changes.
