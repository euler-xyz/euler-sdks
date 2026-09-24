import Lean
import EulerArithmetic

/-!
An executable oracle using exactly the definitions in the proved module.
Decimal strings preserve integers wider than JSON/JavaScript numbers.
-/

open Lean EulerArithmetic

def row (a s amount : Nat) : Lean.Json :=
  Lean.Json.arr #[
    toJson (toString a),
    toJson (toString s),
    toJson (toString amount),
    toJson (toString (convertToShares a s amount)),
    toJson (toString (convertToAssets a s amount)),
    toJson (toString (previewWithdraw a s amount))
  ]

def main : IO Unit := do
  let stdout ← IO.getStdout
  stdout.putStrLn "["
  let mut first := true
  -- Exhaustive small snapshots and amounts, including the empty vault.
  for a in [:5] do
    for s in [:5] do
      for amount in [:9] do
        unless first do stdout.putStrLn ","
        stdout.putStr (row a s amount).compress
        first := false
  let u112 := 2 ^ 112 - 1
  let u128 := 2 ^ 128 - 1
  let u256 := 2 ^ 256 - 1
  let snapshots := #[
    (0, 0), (0, 1), (1, 0), (1, 3), (3, 1),
    (999999, 1000001), (1000001, 999999),
    (10 ^ 18, 3 * 10 ^ 18), (3 * 10 ^ 18, 10 ^ 18),
    (u112, u112 - 1), (u128, u112), (u112, u128),
    (u256, u256), (u256, 0), (0, u256), (u256 - 1, u256)
  ]
  let amounts := #[
    0, 1, 2, 3, 999999, 1000000, 1000001,
    2 ^ 53 - 1, 2 ^ 53, 2 ^ 53 + 1,
    10 ^ 18 - 1, 10 ^ 18, 10 ^ 18 + 1,
    u112, u128, u256 - 1, u256
  ]
  for (a, s) in snapshots do
    for amount in amounts do
      stdout.putStrLn ","
      stdout.putStr (row a s amount).compress
  stdout.putStrLn "\n]"
