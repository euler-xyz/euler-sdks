import Std

/-!
Arithmetic specification for the three EVault conversion methods.

All quantities are natural numbers. The positive virtual deposit makes both
adjusted totals positive, including an empty vault. Products are unbounded:
this models TypeScript bigint, not Solidity overflow/revert or live state.
-/

namespace EulerArithmetic

def virtualDeposit : Nat := 1000000

def floorDiv (n d : Nat) : Nat := n / d
def ceilDiv (n d : Nat) : Nat := (n + d - 1) / d

def convertToShares (totalAssets totalShares assets : Nat) : Nat :=
  floorDiv (assets * (totalShares + virtualDeposit)) (totalAssets + virtualDeposit)

def convertToAssets (totalAssets totalShares shares : Nat) : Nat :=
  floorDiv (shares * (totalAssets + virtualDeposit)) (totalShares + virtualDeposit)

def previewWithdraw (totalAssets totalShares assets : Nat) : Nat :=
  ceilDiv (assets * (totalShares + virtualDeposit)) (totalAssets + virtualDeposit)

theorem adjustedTotal_pos (total : Nat) : 0 < total + virtualDeposit := by
  unfold virtualDeposit
  omega

/-- Floor rounding never overstates the rational result. -/
theorem floor_lower (n d : Nat) : floorDiv n d * d ≤ n := by
  exact Nat.div_mul_le_self n d

/-- Floor rounding loses strictly less than one unit. -/
theorem floor_upper (n d : Nat) (hd : 0 < d) :
    n < (floorDiv n d + 1) * d := by
  exact (Nat.div_lt_iff_lt_mul hd).mp (Nat.lt_succ_self (n / d))

/-- The executable add-before-divide ceiling is the least sufficient quotient. -/
theorem ceil_le_iff (n d k : Nat) (hd : 0 < d) :
    ceilDiv n d ≤ k ↔ n ≤ k * d := by
  unfold ceilDiv
  have h := Nat.div_lt_iff_lt_mul (x := n + d - 1) (y := k + 1) hd
  rw [Nat.add_mul, Nat.one_mul] at h
  omega

theorem ceil_sufficient (n d : Nat) (hd : 0 < d) :
    n ≤ ceilDiv n d * d := by
  exact (ceil_le_iff n d (ceilDiv n d) hd).mp (Nat.le_refl _)

theorem ceil_minimal (n d k : Nat) (hd : 0 < d) (hk : k < ceilDiv n d) :
    k * d < n := by
  have h := ceil_le_iff n d k hd
  omega

theorem ceil_upper (n d : Nat) (hd : 0 < d) :
    ceilDiv n d * d < n + d := by
  have h := floor_lower (n + d - 1) d
  unfold floorDiv at h
  unfold ceilDiv
  omega

theorem convertToShares_bounds (a s assets : Nat) :
    convertToShares a s assets * (a + virtualDeposit) ≤ assets * (s + virtualDeposit) ∧
    assets * (s + virtualDeposit) < (convertToShares a s assets + 1) * (a + virtualDeposit) := by
  exact ⟨floor_lower _ _, floor_upper _ _ (adjustedTotal_pos a)⟩

theorem convertToAssets_bounds (a s shares : Nat) :
    convertToAssets a s shares * (s + virtualDeposit) ≤ shares * (a + virtualDeposit) ∧
    shares * (a + virtualDeposit) < (convertToAssets a s shares + 1) * (s + virtualDeposit) := by
  exact convertToShares_bounds s a shares

theorem previewWithdraw_bounds (a s assets : Nat) :
    assets * (s + virtualDeposit) ≤ previewWithdraw a s assets * (a + virtualDeposit) ∧
    previewWithdraw a s assets * (a + virtualDeposit) < assets * (s + virtualDeposit) +
      (a + virtualDeposit) := by
  exact ⟨ceil_sufficient _ _ (adjustedTotal_pos a), ceil_upper _ _ (adjustedTotal_pos a)⟩

theorem floor_mono (n m d : Nat) (h : n ≤ m) :
    floorDiv n d ≤ floorDiv m d := by
  by_cases hd : d = 0
  · simp [floorDiv, hd]
  · exact (Nat.le_div_iff_mul_le (Nat.pos_of_ne_zero hd)).mpr
      (Nat.le_trans (floor_lower n d) h)

theorem ceil_mono (n m d : Nat) (hd : 0 < d) (h : n ≤ m) :
    ceilDiv n d ≤ ceilDiv m d := by
  apply (ceil_le_iff n d (ceilDiv m d) hd).mpr
  exact Nat.le_trans h (ceil_sufficient m d hd)

theorem convertToShares_mono (a s x y : Nat) (h : x ≤ y) :
    convertToShares a s x ≤ convertToShares a s y := by
  exact floor_mono _ _ _ (Nat.mul_le_mul_right _ h)

theorem convertToAssets_mono (a s x y : Nat) (h : x ≤ y) :
    convertToAssets a s x ≤ convertToAssets a s y := by
  exact floor_mono _ _ _ (Nat.mul_le_mul_right _ h)

theorem previewWithdraw_mono (a s x y : Nat) (h : x ≤ y) :
    previewWithdraw a s x ≤ previewWithdraw a s y := by
  exact ceil_mono _ _ _ (adjustedTotal_pos a) (Nat.mul_le_mul_right _ h)

/-- Precisely characterizes all share amounts sufficient for a withdrawal. -/
theorem withdrawal_iff (a s assets shares : Nat) :
    previewWithdraw a s assets ≤ shares ↔ assets ≤ convertToAssets a s shares := by
  unfold previewWithdraw convertToAssets floorDiv
  rw [ceil_le_iff _ _ _ (adjustedTotal_pos a)]
  exact (Nat.le_div_iff_mul_le (adjustedTotal_pos s)).symm

theorem withdrawal_sufficient (a s assets : Nat) :
    assets ≤ convertToAssets a s (previewWithdraw a s assets) := by
  exact (withdrawal_iff a s assets _).mp (Nat.le_refl _)

theorem withdrawal_minimal (a s assets shares : Nat)
    (h : shares < previewWithdraw a s assets) :
    convertToAssets a s shares < assets := by
  have hi := withdrawal_iff a s assets shares
  omega

/-- A floor-rounded assets -> shares -> assets trip cannot create assets. -/
theorem assets_roundTrip_nonInflation (a s assets : Nat) :
    convertToAssets a s (convertToShares a s assets) ≤ assets := by
  unfold convertToAssets convertToShares floorDiv
  apply Nat.div_le_of_le_mul
  simpa [Nat.mul_comm] using Nat.div_mul_le_self (assets * (s + virtualDeposit))
    (a + virtualDeposit)

/-- The corresponding shares -> assets -> shares trip cannot create shares. -/
theorem shares_roundTrip_nonInflation (a s shares : Nat) :
    convertToShares a s (convertToAssets a s shares) ≤ shares := by
  exact assets_roundTrip_nonInflation s a shares

theorem zero_conversions (a s : Nat) :
    convertToShares a s 0 = 0 ∧ convertToAssets a s 0 = 0 ∧
    previewWithdraw a s 0 = 0 := by
  constructor
  · simp [convertToShares, floorDiv]
  constructor
  · simp [convertToAssets, floorDiv]
  · have h := (ceil_le_iff 0 (a + virtualDeposit) 0 (adjustedTotal_pos a)).mpr
      (by simp)
    simpa [previewWithdraw, Nat.zero_mul] using Nat.eq_zero_of_le_zero h

end EulerArithmetic
