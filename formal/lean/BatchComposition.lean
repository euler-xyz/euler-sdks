import Std

/-!
Reference semantics for ordered call composition under one execution boundary.

A call may change arbitrary state, emit ordered observations, or fail. Failure
stops later calls. Chunk boundaries carry no execution behavior; an arbitrary
finalizer is applied once after all chunks. Consequently these theorems justify
regrouping calls *within the same boundary*, not merging separate blockchain
transactions with independently run status checks or rollback behavior.

Observations are abstract execution traces, not necessarily committed EVM logs.
Neither TypeScript nor EVC bytecode is translated or verified by this module.
Implementation correspondence is tested separately in batchComposition.test.ts.
-/

namespace BatchComposition

universe u v w x y

structure Outcome (State : Type u) (Observation : Type v) (Failure : Type w) where
  status : Except Failure State
  observations : List Observation
  deriving Repr

/-- A failed execution is terminal; successful calls append observations in order. -/
def advance {State : Type u} {Call : Type v} {Observation : Type w} {Failure : Type x}
    (step : State → Call → Outcome State Observation Failure)
    (current : Outcome State Observation Failure) (call : Call) :
    Outcome State Observation Failure :=
  match current.status with
  | .error _ => current
  | .ok state =>
    let next := step state call
    { status := next.status, observations := current.observations ++ next.observations }

def runCalls {State : Type u} {Call : Type v} {Observation : Type w} {Failure : Type x}
    (step : State → Call → Outcome State Observation Failure)
    (calls : List Call) (initial : Outcome State Observation Failure) :
    Outcome State Observation Failure :=
  calls.foldl (advance step) initial

def runChunks {State : Type u} {Call : Type v} {Observation : Type w} {Failure : Type x}
    (step : State → Call → Outcome State Observation Failure)
    (chunks : List (List Call)) (initial : Outcome State Observation Failure) :
    Outcome State Observation Failure :=
  chunks.foldl (fun current chunk => runCalls step chunk current) initial

/-- Sequential concatenation preserves state, failure, and the entire ordered trace. -/
theorem runCalls_append
    {State : Type u} {Call : Type v} {Observation : Type w} {Failure : Type x}
    (step : State → Call → Outcome State Observation Failure)
    (left right : List Call) (initial : Outcome State Observation Failure) :
    runCalls step (left ++ right) initial =
      runCalls step right (runCalls step left initial) := by
  exact List.foldl_append

/-- Arbitrarily many chunks, including empty chunks, execute as their flattened calls. -/
theorem runChunks_eq_flatten
    {State : Type u} {Call : Type v} {Observation : Type w} {Failure : Type x}
    (step : State → Call → Outcome State Observation Failure)
    (chunks : List (List Call)) (initial : Outcome State Observation Failure) :
    runChunks step chunks initial = runCalls step chunks.flatten initial := by
  induction chunks generalizing initial with
  | nil => rfl
  | cons head tail ih =>
    change runChunks step tail (runCalls step head initial) =
      runCalls step (head ++ tail.flatten) initial
    rw [ih, runCalls_append]

/-- Any repartition preserving every call in order preserves all abstract behavior. -/
theorem regrouping_preserves_execution
    {State : Type u} {Call : Type v} {Observation : Type w} {Failure : Type x}
    (step : State → Call → Outcome State Observation Failure)
    (left right : List (List Call))
    (sameCalls : left.flatten = right.flatten)
    (initial : Outcome State Observation Failure) :
    runChunks step left initial = runChunks step right initial := by
  rw [runChunks_eq_flatten, runChunks_eq_flatten, sameCalls]

/-- A shared final status-check/commit boundary may inspect the whole result arbitrarily. -/
theorem composition_at_one_boundary
    {State : Type u} {Call : Type v} {Observation : Type w} {Failure : Type x}
    {Result : Type y}
    (step : State → Call → Outcome State Observation Failure)
    (finish : Outcome State Observation Failure → Result)
    (chunks : List (List Call)) (initial : Outcome State Observation Failure) :
    finish (runChunks step chunks initial) =
      finish (runCalls step chunks.flatten initial) := by
  rw [runChunks_eq_flatten]

/-- No later call runs or appends observations after a failure. -/
theorem failure_is_terminal
    {State : Type u} {Call : Type v} {Observation : Type w} {Failure : Type x}
    (step : State → Call → Outcome State Observation Failure)
    (calls : List Call) (failure : Failure) (observations : List Observation) :
    runCalls step calls { status := .error failure, observations } =
      { status := .error failure, observations } := by
  induction calls with
  | nil => rfl
  | cons call tail ih => simpa [runCalls, advance] using ih

inductive CollateralCall where
  | enable
  | disable
  | observe
  deriving DecidableEq, Repr

def collateralStep (enabled : Bool) (call : CollateralCall) : Outcome Bool Bool Unit :=
  match call with
  | .enable => { status := .ok true, observations := [] }
  | .disable => { status := .ok false, observations := [] }
  | .observe => { status := .ok enabled, observations := [enabled] }

def initialCollateral (enabled : Bool) : Outcome Bool Bool Unit :=
  { status := .ok enabled, observations := [] }

/-- The historical cancellation rule changes final state for initially enabled collateral. -/
theorem cancellation_changes_final_state :
    (runCalls collateralStep [.enable, .disable] (initialCollateral true)).status =
      .ok false ∧
    (runCalls collateralStep [] (initialCollateral true)).status = .ok true := by
  simp [runCalls, advance, collateralStep, initialCollateral]

theorem cancellation_counterexample :
    runCalls collateralStep [.enable, .disable] (initialCollateral true) ≠
      runCalls collateralStep [] (initialCollateral true) := by
  simp [runCalls, advance, collateralStep, initialCollateral]

/-- Even equal final flags do not establish equivalence when an intermediate call observes them. -/
theorem intermediate_observation_counterexample :
    (runCalls collateralStep [.enable, .observe, .disable] (initialCollateral false)).status =
      (runCalls collateralStep [.observe] (initialCollateral false)).status ∧
    (runCalls collateralStep [.enable, .observe, .disable] (initialCollateral false)).observations ≠
      (runCalls collateralStep [.observe] (initialCollateral false)).observations := by
  simp [runCalls, advance, collateralStep, initialCollateral]

end BatchComposition
