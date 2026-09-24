------------------------- MODULE MaterializedExecution -------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC

\* A finite safety abstraction of executeMaterialized, not a proof of its
\* TypeScript implementation or of blockchain/wallet correctness. Indices are
\* one-based here and zero-based in the SDK. See README.md for the mapping.
CONSTANTS RequestCount, SlotRequests, AlreadyFinalized, Revalidate, Mutation
TwoSignedRequests == <<2, 3>>
TwoSlotsInFirstRequest == <<1, 1>>
TwoSlotsAfterTwoPrerequisites == <<3, 3>>
SecondRequestSigned == <<2>>
FirstRequestSigned == <<1>>
NoSignatures == <<>>
ASSUME /\ RequestCount \in Nat
       /\ SlotRequests \in Seq(1..RequestCount)
       /\ AlreadyFinalized \in BOOLEAN
       /\ Revalidate \in BOOLEAN
       /\ Mutation \in {"none", "receipt", "signature", "order", "completion"}

Requests == 1..RequestCount
Slots == 1..Len(SlotRequests)
FirstSigned == IF Slots = {} THEN 1
               ELSE CHOOSE x \in {SlotRequests[k] : k \in Slots} :
                      \A k \in Slots : x <= SlotRequests[k]
RequiredSlots(j) == {k \in Slots : SlotRequests[k] = j}
Terminal == {"done", "failed", "interrupted"}
HookPhases == {"signatureProgress", "beforeSignature", "finalizedHook",
               "beforeStep", "transactionProgress", "hashHook", "afterStep",
               "afterProgress", "completeProgress"}

VARIABLE s
vars == <<s>>

Init == s = [pc |-> IF Revalidate /\ Slots # {} /\
                          (AlreadyFinalized \/ FirstSigned > 1)
                    THEN "initialNonce" ELSE "route",
             i |-> 1, k |-> 1, nonceCursor |-> 1,
             signatures |-> IF AlreadyFinalized THEN Slots ELSE {},
             finalized |-> AlreadyFinalized, finalizedHook |-> FALSE,
             beforeSignatures |-> {}, stepChecks |-> {},
             nonceDrift |-> {}, dispatched |-> <<>>, witnesses |-> <<>>,
             hashes |-> {}, receipts |-> {}, afterSteps |-> {},
             broadcastPossible |-> {}, completed |-> FALSE, failure |-> ""]

Move(pc) == s' = [s EXCEPT !.pc = pc]
Fail(reason) == s' = [s EXCEPT !.pc = "failed", !.failure = reason]

\* Permit2 state can change at every asynchronous boundary. A successful read
\* establishes a snapshot, never a lock lasting until broadcast or execution.
Drift == /\ s.pc \notin Terminal
         /\ \E k \in Slots \ s.nonceDrift :
              s' = [s EXCEPT !.nonceDrift = @ \cup {k}]

InitialNonce ==
  /\ s.pc = "initialNonce"
  /\ IF s.nonceCursor > Len(SlotRequests)
        THEN Move("route")
        ELSE \/ Fail("nonce RPC error")
             \/ IF s.nonceCursor \in s.nonceDrift
                   THEN Fail("initial nonce mismatch")
                   ELSE s' = [s EXCEPT !.nonceCursor = @ + 1]

Route ==
  /\ s.pc = "route"
  /\ IF ~s.finalized /\ s.i >= FirstSigned
        THEN Move("signatureProgress")
        ELSE IF s.finalized /\ ~s.finalizedHook
                THEN Move("finalizedHook")
                ELSE IF s.i > RequestCount
                        THEN Move("completeProgress")
                        ELSE s' = [s EXCEPT !.pc = "stepNonce",
                                          !.nonceCursor = 1, !.stepChecks = {}]

SignatureProgress == /\ s.pc = "signatureProgress"
                     /\ Move("signatureNonce")
SignatureNonce ==
  /\ s.pc = "signatureNonce"
  /\ IF s.k > Len(SlotRequests)
        THEN Move("finalize")
        ELSE IF Revalidate
                THEN \/ Fail("signature nonce RPC error")
                     \/ IF s.k \in s.nonceDrift
                           THEN Fail("signature nonce mismatch")
                           ELSE Move("beforeSignature")
                ELSE Move("beforeSignature")
BeforeSignature == /\ s.pc = "beforeSignature"
                   /\ s' = [s EXCEPT !.pc = "sign",
                                     !.beforeSignatures = @ \cup {s.k}]
Sign == /\ s.pc = "sign"
        /\ \/ Fail("signature wallet rejected")
           \/ s' = [s EXCEPT !.pc = "signatureNonce",
                              !.signatures = @ \cup {s.k}, !.k = @ + 1]
Finalize == /\ s.pc = "finalize"
            /\ \/ Fail("finalization rejected")
               \/ s' = [s EXCEPT !.pc = "finalizedHook", !.finalized = TRUE]
FinalizedHook == /\ s.pc = "finalizedHook"
                 /\ s' = [s EXCEPT !.pc = "route", !.finalizedHook = TRUE]

StepNonce ==
  /\ s.pc = "stepNonce"
  /\ IF ~Revalidate \/ s.nonceCursor > Len(SlotRequests)
        THEN Move("beforeStep")
        ELSE IF s.nonceCursor \notin RequiredSlots(s.i)
                THEN s' = [s EXCEPT !.nonceCursor = @ + 1]
                ELSE \/ Fail("step nonce RPC error")
                     \/ IF s.nonceCursor \in s.nonceDrift
                           THEN Fail("step nonce mismatch")
                           ELSE s' = [s EXCEPT !.nonceCursor = @ + 1,
                                      !.stepChecks = @ \cup {s.nonceCursor}]
BeforeStep == /\ s.pc = "beforeStep" /\ Move("transactionProgress")
TransactionProgress == /\ s.pc = "transactionProgress" /\ Move("send")

DispatchIndex == IF Mutation = "order" /\ s.i = 1 /\ RequestCount > 1
                    THEN RequestCount ELSE s.i
Witness == [index |-> DispatchIndex, receipts |-> s.receipts,
            afterSteps |-> s.afterSteps, signatures |-> s.signatures,
            finalized |-> s.finalized, finalizedHook |-> s.finalizedHook,
            checked |-> s.stepChecks, drift |-> s.nonceDrift]
Send ==
  /\ s.pc = "send"
  /\ \E outcome \in {"hash", "rejected", "unknown"} :
       s' = [s EXCEPT !.dispatched = Append(@, DispatchIndex),
                      !.witnesses = Append(@, Witness),
                      !.pc = IF outcome = "hash" THEN "hashHook" ELSE "failed",
                      !.hashes = IF outcome = "hash" THEN @ \cup {s.i} ELSE @,
                      !.broadcastPossible = IF outcome # "rejected"
                                               THEN @ \cup {s.i} ELSE @,
                      !.failure = IF outcome = "hash" THEN "" ELSE outcome]
HashHook == /\ s.pc = "hashHook" /\ Move("receipt")
Receipt == /\ s.pc = "receipt"
           /\ \/ Fail("receipt reverted")
              \/ Fail("receipt polling failed; chain outcome unknown")
              \/ s' = [s EXCEPT !.pc = "afterStep", !.receipts = @ \cup {s.i}]
AfterStep == /\ s.pc = "afterStep"
             /\ s' = [s EXCEPT !.pc = "afterProgress", !.afterSteps = @ \cup {s.i}]
AfterProgress == /\ s.pc = "afterProgress"
                 /\ s' = [s EXCEPT !.pc = "route", !.i = @ + 1]
CompleteProgress == /\ s.pc = "completeProgress"
                    /\ s' = [s EXCEPT !.pc = "done", !.completed = TRUE]

\* Hooks and synchronous onProgress callbacks can throw. Interruption never
\* implies that a broadcast transaction has been cancelled on chain.
HookFailure == /\ s.pc \in HookPhases /\ Fail(s.pc)
Interrupt == /\ s.pc \notin Terminal /\ Move("interrupted")

\* Deliberately wrong alternatives used only by expected-failure controls.
Mutant == \/ /\ Mutation = "receipt" /\ s.pc = "receipt"
             /\ s.i < RequestCount
             /\ s' = [s EXCEPT !.pc = "route", !.i = @ + 1]
          \/ /\ Mutation = "signature" /\ s.pc = "signatureProgress"
             /\ s' = [s EXCEPT !.pc = "finalizedHook", !.finalized = TRUE]
          \/ /\ Mutation = "completion" /\ s.pc = "route"
             /\ s' = [s EXCEPT !.pc = "done", !.completed = TRUE]

Next == InitialNonce \/ Route \/ SignatureProgress \/ SignatureNonce \/
        BeforeSignature \/ Sign \/ Finalize \/ FinalizedHook \/ StepNonce \/
        BeforeStep \/ TransactionProgress \/ Send \/ HashHook \/ Receipt \/
        AfterStep \/ AfterProgress \/ CompleteProgress \/ HookFailure \/
        Interrupt \/ Drift \/ Mutant \/ (s.pc \in Terminal /\ UNCHANGED vars)
Spec == Init /\ [][Next]_vars

TypeOK == /\ s.i \in 1..(RequestCount + 1)
          /\ s.signatures \subseteq Slots /\ s.nonceDrift \subseteq Slots
          /\ s.receipts \subseteq s.hashes /\ s.hashes \subseteq Requests
          /\ s.afterSteps \subseteq s.receipts
          /\ s.dispatched \in Seq(Requests)
          /\ Len(s.witnesses) = Len(s.dispatched)
RequestOrder == \A j \in 1..Len(s.dispatched) : s.dispatched[j] = j
PrerequisiteSuccess == \A w \in {s.witnesses[j] : j \in 1..Len(s.witnesses)} :
                         (1..(w.index - 1)) \subseteq w.receipts
HookGate == \A w \in {s.witnesses[j] : j \in 1..Len(s.witnesses)} :
              (1..(w.index - 1)) \subseteq w.afterSteps
SignaturesBeforeSignedCalls ==
  \A w \in {s.witnesses[j] : j \in 1..Len(s.witnesses)} :
    w.index >= FirstSigned =>
      /\ w.finalized /\ w.finalizedHook /\ w.signatures = Slots
CompletedOnlyAfterSuccess == s.completed =>
  /\ s.receipts = Requests /\ s.afterSteps = Requests
  /\ Len(s.dispatched) = RequestCount /\ s.finalized /\ s.finalizedHook
NonceChecksBeforeDispatch == Revalidate =>
  \A w \in {s.witnesses[j] : j \in 1..Len(s.witnesses)} :
    RequiredSlots(w.index) \subseteq w.checked

\* This tempting stronger statement is FALSE even when Revalidate = TRUE.
\* The expected-failure race configuration documents the TOCTOU boundary.
NonceStillPinnedAtDispatch ==
  \A w \in {s.witnesses[j] : j \in 1..Len(s.witnesses)} :
    RequiredSlots(w.index) \cap w.drift = {}

\* Reachability checks deliberately violate these invariants when the useful
\* path is reached, so safety cannot pass merely because no work was possible.
NeverCompletes == ~s.completed
NeverHasUnknownBroadcast == s.broadcastPossible \subseteq s.hashes
=============================================================================
