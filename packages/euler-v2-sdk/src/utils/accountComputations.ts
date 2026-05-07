/**
 * Pure computation functions for sub-account metrics and leverage utilities.
 * All functions return `undefined` when prerequisites are missing.
 */

import { type Address, getAddress, isAddressEqual } from "viem";
import type {
	IAccount,
	IAccountLiquidity,
	IHasVaultAddress,
	ISubAccount,
} from "../entities/Account.js";

const WAD = 10n ** 18n;

// ---------------------------------------------------------------------------
// Sub-account risk metrics (oracle-denominated, not USD)
// ---------------------------------------------------------------------------

/**
 * Health factor for a sub-account's borrow position.
 * `totalCollateralValue.liquidation / liabilityValue.liquidation` (WAD, 18 dec).
 * `> 1e18` = healthy, `< 1e18` = liquidatable.
 */
export function computeHealthFactor(
	subAccount: ISubAccount<IHasVaultAddress>,
): bigint | undefined {
	const liq = findLiquidity(subAccount);
	if (!liq) return undefined;
	if (liq.liabilityValue.liquidation === 0n) return undefined;
	return (
		(liq.totalCollateralValue.liquidation * WAD) /
		liq.liabilityValue.liquidation
	);
}

/**
 * Current loan-to-value ratio for a sub-account.
 * `liabilityValue.oracleMid / totalCollateralValue.oracleMid` (WAD).
 */
export function computeCurrentLTV(
	subAccount: ISubAccount<IHasVaultAddress>,
): bigint | undefined {
	const liq = findLiquidity(subAccount);
	if (!liq) return undefined;
	if (liq.totalCollateralValue.oracleMid === 0n) return undefined;
	return (
		(liq.liabilityValue.oracleMid * WAD) / liq.totalCollateralValue.oracleMid
	);
}

/**
 * Weighted-average liquidation LTV threshold.
 * `totalCollateralValue.liquidation / totalCollateralValue.oracleMid` (WAD).
 */
export function computeLiquidationLTV(
	subAccount: ISubAccount<IHasVaultAddress>,
): bigint | undefined {
	const liq = findLiquidity(subAccount);
	if (!liq) return undefined;
	if (liq.totalCollateralValue.oracleMid === 0n) return undefined;
	return (
		(liq.totalCollateralValue.liquidation * WAD) /
		liq.totalCollateralValue.oracleMid
	);
}

// ---------------------------------------------------------------------------
// Sub-account USD metrics (require populated market prices)
// ---------------------------------------------------------------------------

/**
 * Leverage multiplier for a sub-account (1 = 1x).
 * `suppliedCollateralValueUsd / (suppliedCollateralValueUsd - borrowedValueUsd)`.
 */
export function computeMultiplier(
	subAccount: ISubAccount<IHasVaultAddress>,
): number | undefined {
	const borrow = findBorrowPosition(subAccount);
	if (!borrow) return undefined;
	return computeCollateralMultiplier(
		sumPositionUsd(
			findCollateralPositionsForBorrow(subAccount, borrow),
			"suppliedValueUsd",
		),
		borrow.borrowedValueUsd,
	);
}

export function computeCollateralMultiplier(
	suppliedValueUsd: number | undefined,
	borrowedValueUsd: number | undefined,
): number | undefined {
	if (suppliedValueUsd == null || borrowedValueUsd == null) return undefined;
	const equity = suppliedValueUsd - borrowedValueUsd;
	if (equity <= 0) return undefined;
	return suppliedValueUsd / equity;
}

/**
 * Total collateral value in USD for a sub-account.
 * Sourced from sub-account liquidity and populated by `populateMarketPrices`.
 */
export function computeSubAccountTotalCollateralValueUsd(
	subAccount: ISubAccount<IHasVaultAddress>,
): number | undefined {
	return findLiquidity(subAccount)?.totalCollateralValueUsd;
}

/**
 * Liability value in USD for a sub-account.
 * Sourced from sub-account liquidity and populated by `populateMarketPrices`.
 */
export function computeSubAccountLiabilityValueUsd(
	subAccount: ISubAccount<IHasVaultAddress>,
): number | undefined {
	return findLiquidity(subAccount)?.liabilityValueUsd;
}

/**
 * Net value in USD for a sub-account: sum(suppliedValueUsd) - sum(borrowedValueUsd).
 */
export function computeSubAccountNetValueUsd(
	subAccount: ISubAccount<IHasVaultAddress>,
): number | undefined {
	let supplied: number | undefined;
	let borrowed: number | undefined;

	for (const p of subAccount.positions) {
		if (p.suppliedValueUsd != null)
			supplied = (supplied ?? 0) + p.suppliedValueUsd;
		if (p.borrowedValueUsd != null)
			borrowed = (borrowed ?? 0) + p.borrowedValueUsd;
	}

	if (supplied == null) return undefined;
	return supplied - (borrowed ?? 0);
}

// ---------------------------------------------------------------------------
// Liquidation price multipliers (oracle-denominated)
// ---------------------------------------------------------------------------

/**
 * Per-collateral liquidation price multipliers.
 * For each collateral: `(liability - otherCollateral) / thisCollateral` (WAD).
 * `< 1` means the price can drop by this factor before liquidation.
 */
export function computeCollateralLiquidationPrices(
	liquidity: IAccountLiquidity<IHasVaultAddress>,
): Record<Address, bigint> {
	const result: Record<Address, bigint> = {};
	const totalColl = liquidity.totalCollateralValue.liquidation;
	const liability = liquidity.liabilityValue.liquidation;

	for (const c of liquidity.collaterals) {
		if (c.value.liquidation === 0n) continue;
		const otherColl = totalColl - c.value.liquidation;
		const gap = liability - otherColl;
		if (gap <= 0n) continue;
		result[c.address] = (gap * WAD) / c.value.liquidation;
	}

	return result;
}

/**
 * Borrow liquidation price multiplier (WAD).
 * `totalCollateralValue.liquidation / liabilityValue.liquidation`.
 * `> 1` = borrow price can increase by this factor before liquidation.
 */
export function computeBorrowLiquidationPrice(
	liquidity: IAccountLiquidity<IHasVaultAddress>,
): bigint | undefined {
	if (liquidity.liabilityValue.liquidation === 0n) return undefined;
	return (
		(liquidity.totalCollateralValue.liquidation * WAD) /
		liquidity.liabilityValue.liquidation
	);
}

// ---------------------------------------------------------------------------
// Sub-account ROE (requires populated vaults + market prices)
// ---------------------------------------------------------------------------

/**
 * ROE (Return on Equity) breakdown for a sub-account.
 * All values are percentage points (5 = 5%).
 */
export interface SubAccountRoe {
	/** ROE contribution from base supply APYs. */
	lending: number;
	/** ROE contribution from base borrow APYs (typically negative). */
	borrowing: number;
	/** ROE contribution from reward APRs (supply + borrow incentives). */
	rewards: number;
	/** ROE contribution from intrinsic asset yield (e.g. staking rewards, PT implied yield). */
	intrinsicApy: number;
	/** Total ROE: lending + borrowing + rewards + intrinsicApy. */
	total: number;
}

/**
 * APY/ROE contribution breakdown.
 * All values are percentage points (5 = 5%).
 */
export interface YieldApyBreakdown {
	/** Contribution from base supply APYs. */
	lending: number;
	/** Contribution from base borrow APYs (typically negative). */
	borrowing: number;
	/** Contribution from supply and borrow reward APRs. */
	rewards: number;
	/** Contribution from intrinsic asset yield. */
	intrinsicApy: number;
	/** Total contribution. */
	total: number;
}

/**
 * Computes the ROE breakdown for a sub-account.
 * Requires populated vaults (for APY data) and market prices (for USD values).
 * Returns `undefined` when prerequisites are missing or equity <= 0.
 */
export function computeSubAccountRoe(
	subAccount: ISubAccount<IHasVaultAddress>,
): SubAccountRoe | undefined {
	let totalLendingYield = 0;
	let totalBorrowingYield = 0;
	let totalRewardYield = 0;
	let totalIntrinsicYield = 0;
	let totalSupplyUsd = 0;
	let totalBorrowUsd = 0;
	let hasData = false;
	for (const p of subAccount.positions) {
		const vault = p.vault as any;
		if (!vault) continue;

		const intrinsicApyDecimal = getVaultIntrinsicApy(vault);

		// Supply side
		if (p.suppliedValueUsd != null && p.suppliedValueUsd > 0) {
			const supplyUsd = p.suppliedValueUsd;

			const supplyApy = getVaultSupplyApy(vault);
			if (supplyApy != null) {
				hasData = true;
				totalSupplyUsd += supplyUsd;
				totalLendingYield += supplyUsd * supplyApy;
				totalRewardYield += supplyUsd * getVaultRewardApr(vault, "LEND");
				totalIntrinsicYield += supplyUsd * intrinsicApyDecimal;
			}
		}

		// Borrow side
		if (p.borrowedValueUsd != null && p.borrowedValueUsd > 0) {
			const borrowUsd = p.borrowedValueUsd;
			const borrowApy = getVaultBorrowApy(vault);
			if (borrowApy != null) {
				hasData = true;
				totalBorrowUsd += borrowUsd;
				totalBorrowingYield += borrowUsd * borrowApy;
				totalRewardYield += borrowUsd * getVaultRewardApr(vault, "BORROW");
				totalIntrinsicYield -= borrowUsd * intrinsicApyDecimal;
			}
		}
	}

	if (!hasData) return undefined;

	const equity = totalSupplyUsd - totalBorrowUsd;
	if (equity <= 0) return undefined;

	const lending = totalLendingYield / equity;
	const borrowing = -totalBorrowingYield / equity;
	const rewards = totalRewardYield / equity;
	const intrinsicApy = totalIntrinsicYield / equity;

	return {
		lending,
		borrowing,
		rewards,
		intrinsicApy,
		total: lending + borrowing + rewards + intrinsicApy,
	};
}

// ---------------------------------------------------------------------------
// Account-level yield metrics (requires populated vaults + market prices)
// ---------------------------------------------------------------------------

/**
 * Net APY across the full account, relative to total supplied value.
 *
 * `totalNetYield / totalSupplyUsd`, where net yield includes supply APY,
 * borrow costs, supply/borrow reward APRs, and intrinsic APY.
 */
export function computeAccountNetApy(
	account: IAccount<IHasVaultAddress>,
): number | undefined {
	const totals = computeAccountYieldTotals(account);
	if (!totals) return undefined;
	if (totals.totalSupplyUsd === 0) return 0;
	return totals.totalNetYield / totals.totalSupplyUsd;
}

/**
 * Net APY across a pre-filtered set of positions, relative to supplied value.
 * Use this when a higher-level view intentionally excludes some account positions.
 */
export function computePositionsNetApy(
	positions: Iterable<AccountYieldPosition>,
): number | undefined {
	const totals = computePositionYieldTotals(positions);
	if (!totals) return undefined;
	if (totals.totalSupplyUsd === 0) return 0;
	return totals.totalNetYield / totals.totalSupplyUsd;
}

/**
 * Return on equity across the full account, relative to net asset value.
 *
 * `totalNetYield / (totalSupplyUsd - totalBorrowUsd)`.
 */
export function computeAccountRoe(
	account: IAccount<IHasVaultAddress>,
): number | undefined {
	const totals = computeAccountYieldTotals(account);
	if (!totals) return undefined;
	if (totals.totalEquityUsd <= 0) return 0;
	return totals.totalNetYield / totals.totalEquityUsd;
}

/**
 * Return on equity across a pre-filtered set of positions, relative to net asset value.
 * Use this when a higher-level view intentionally excludes some account positions.
 */
export function computePositionsRoe(
	positions: Iterable<AccountYieldPosition>,
): number | undefined {
	const totals = computePositionYieldTotals(positions);
	if (!totals) return undefined;
	if (totals.totalEquityUsd <= 0) return 0;
	return totals.totalNetYield / totals.totalEquityUsd;
}

/**
 * APY contribution breakdown across a pre-filtered set of positions, relative to supplied value.
 */
export function computePositionsNetApyBreakdown(
	positions: Iterable<AccountYieldPosition>,
): YieldApyBreakdown | undefined {
	const totals = computePositionYieldTotals(positions);
	if (!totals) return undefined;
	if (totals.totalSupplyUsd === 0) return zeroYieldApyBreakdown();
	return divideYieldTotals(totals, totals.totalSupplyUsd);
}

/**
 * ROE contribution breakdown across a pre-filtered set of positions, relative to net asset value.
 */
export function computePositionsRoeBreakdown(
	positions: Iterable<AccountYieldPosition>,
): YieldApyBreakdown | undefined {
	const totals = computePositionYieldTotals(positions);
	if (!totals) return undefined;
	if (totals.totalEquityUsd <= 0) return zeroYieldApyBreakdown();
	return divideYieldTotals(totals, totals.totalEquityUsd);
}

/**
 * APY breakdown for a single supplied vault position.
 * Does not require USD values because a single supply-side APY is value-independent.
 */
export function computeSupplyApyBreakdown(
	vault: IHasVaultAddress | undefined,
): YieldApyBreakdown | undefined {
	if (!vault) return undefined;

	const lending = getVaultSupplyApy(vault) ?? 0;
	const intrinsicApy = getIntrinsicApyContribution(
		lending,
		getVaultIntrinsicApy(vault),
	);
	const rewards = getVaultRewardApr(vault, "LEND");

	return {
		lending,
		borrowing: 0,
		rewards,
		intrinsicApy,
		total: lending + rewards + intrinsicApy,
	};
}

// ---------------------------------------------------------------------------
// Yield computations (use `number` since APYs are percentages)
// ---------------------------------------------------------------------------

/**
 * Net APY relative to total supply.
 * `(supplyUsd * (supplyApy + supplyReward) - borrowUsd * (borrowApy - borrowReward)) / supplyUsd`
 */
export function getNetApy(
	supplyUsd: number,
	supplyApy: number,
	borrowUsd: number,
	borrowApy: number,
	supplyRewardApy = 0,
	borrowRewardApy = 0,
): number {
	if (supplyUsd === 0) return 0;
	return (
		(supplyUsd * (supplyApy + supplyRewardApy) -
			borrowUsd * (borrowApy - borrowRewardApy)) /
		supplyUsd
	);
}

/**
 * Return on equity (ROE): net yield relative to equity (NAV).
 * Same numerator as getNetApy, but divided by `equity = supplyUsd - borrowUsd`.
 */
export function getRoe(
	supplyUsd: number,
	supplyApy: number,
	borrowUsd: number,
	borrowApy: number,
	supplyRewardApy = 0,
	borrowRewardApy = 0,
): number {
	const equity = supplyUsd - borrowUsd;
	if (equity === 0) return 0;
	return (
		(supplyUsd * (supplyApy + supplyRewardApy) -
			borrowUsd * (borrowApy - borrowRewardApy)) /
		equity
	);
}

// ---------------------------------------------------------------------------
// Leverage utilities
// ---------------------------------------------------------------------------

/**
 * Maximum multiplier for a given borrow LTV.
 * `1 / (1 - (borrowLtv - safetyMargin))` where borrowLtv is decimal (0.85 = 85%).
 * Floored to 2 decimal places, minimum 1.
 */
export function getMaxMultiplier(
	borrowLtv: number,
	safetyMargin = 0.005,
): number {
	const effective = borrowLtv - safetyMargin;
	if (effective >= 1) return 1;
	const raw = 1 / (1 - effective);
	return Math.max(1, Math.floor(raw * 100) / 100);
}

/**
 * Maximum ROE at max leverage.
 * `supplyApy + (maxMultiplier - 1) * (supplyApy - borrowApy)`
 */
export function getMaxRoe(
	maxMultiplier: number,
	supplyApy: number,
	borrowApy: number,
): number {
	return supplyApy + (maxMultiplier - 1) * (supplyApy - borrowApy);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findLiquidity<T extends IHasVaultAddress>(
	subAccount: ISubAccount<T>,
): IAccountLiquidity<T> | undefined {
	for (const p of subAccount.positions) {
		if (p.liquidity) return p.liquidity;
	}
	return undefined;
}

function findBorrowPosition<T extends IHasVaultAddress>(
	subAccount: ISubAccount<T>,
): ISubAccount<T>["positions"][number] | undefined {
	return subAccount.positions.find((position) => position.borrowed > 0n);
}

function findCollateralPositionsForBorrow<T extends IHasVaultAddress>(
	subAccount: ISubAccount<T>,
	borrow: ISubAccount<T>["positions"][number],
): ISubAccount<T>["positions"][number][] {
	const collateralAddresses =
		borrow.liquidity?.collaterals.map((collateral) =>
			getAddress(collateral.address),
		) ??
		subAccount.enabledCollaterals.map((collateral) => getAddress(collateral));

	const collateralPositions = collateralAddresses.flatMap(
		(collateralAddress) => {
			const position = subAccount.positions.find((candidate) =>
				isAddressEqual(candidate.vaultAddress, collateralAddress),
			);
			return position ? [position] : [];
		},
	);

	return collateralPositions.length > 0
		? collateralPositions
		: subAccount.positions.filter((position) => position.isCollateral);
}

function sumPositionUsd(
	positions: Iterable<AccountYieldPosition>,
	field: "suppliedValueUsd" | "borrowedValueUsd",
): number | undefined {
	let total: number | undefined;
	for (const position of positions) {
		if (position[field] != null) {
			total = (total ?? 0) + position[field]!;
		}
	}
	return total;
}

interface AccountYieldTotals {
	totalNetYield: number;
	totalLendingYield: number;
	totalBorrowingYield: number;
	totalRewardYield: number;
	totalIntrinsicYield: number;
	totalEquityUsd: number;
	totalSupplyUsd: number;
}

export interface AccountYieldPosition {
	vault?: IHasVaultAddress;
	suppliedValueUsd?: number;
	borrowedValueUsd?: number;
}

function computeAccountYieldTotals(
	account: IAccount<IHasVaultAddress>,
): AccountYieldTotals | undefined {
	function* positions(): Iterable<AccountYieldPosition> {
		for (const subAccount of Object.values(account.subAccounts ?? {})) {
			if (!subAccount) continue;
			yield* subAccount.positions;
		}
	}

	return computePositionYieldTotals(positions());
}

function computePositionYieldTotals(
	positions: Iterable<AccountYieldPosition>,
): AccountYieldTotals | undefined {
	let totalNetYield = 0;
	let totalLendingYield = 0;
	let totalBorrowingYield = 0;
	let totalRewardYield = 0;
	let totalIntrinsicYield = 0;
	let totalSupplyUsd = 0;
	let totalBorrowUsd = 0;
	let hasUsdData = false;

	for (const position of positions) {
		const vault = position.vault as any;
		if (!vault) continue;

		if (position.suppliedValueUsd != null && position.suppliedValueUsd > 0) {
			const supplyUsd = position.suppliedValueUsd;
			const baseSupplyApy = getVaultSupplyApy(vault) ?? 0;
			const intrinsicSupplyApy = getIntrinsicApyContribution(
				baseSupplyApy,
				getVaultIntrinsicApy(vault),
			);
			const supplyApy = baseSupplyApy + intrinsicSupplyApy;
			const supplyRewardApy = getVaultRewardApr(vault, "LEND");

			totalNetYield += supplyUsd * (supplyApy + supplyRewardApy);
			totalLendingYield += supplyUsd * baseSupplyApy;
			totalRewardYield += supplyUsd * supplyRewardApy;
			totalIntrinsicYield += supplyUsd * intrinsicSupplyApy;
			totalSupplyUsd += supplyUsd;
			hasUsdData = true;
		}

		if (position.borrowedValueUsd != null && position.borrowedValueUsd > 0) {
			const borrowUsd = position.borrowedValueUsd;
			const baseBorrowApy = getVaultBorrowApy(vault) ?? 0;
			const intrinsicBorrowApy = getIntrinsicApyContribution(
				baseBorrowApy,
				getVaultIntrinsicApy(vault),
			);
			const borrowApy = baseBorrowApy + intrinsicBorrowApy;
			const borrowRewardApy = getVaultRewardApr(vault, "BORROW");

			totalNetYield -= borrowUsd * (borrowApy - borrowRewardApy);
			totalBorrowingYield += borrowUsd * baseBorrowApy;
			totalRewardYield += borrowUsd * borrowRewardApy;
			totalIntrinsicYield -= borrowUsd * intrinsicBorrowApy;
			totalBorrowUsd += borrowUsd;
			hasUsdData = true;
		}
	}

	if (!hasUsdData) return undefined;

	return {
		totalNetYield,
		totalLendingYield,
		totalBorrowingYield,
		totalRewardYield,
		totalIntrinsicYield,
		totalEquityUsd: totalSupplyUsd - totalBorrowUsd,
		totalSupplyUsd,
	};
}

function divideYieldTotals(
	totals: AccountYieldTotals,
	denominator: number,
): YieldApyBreakdown {
	const lending = totals.totalLendingYield / denominator;
	const borrowing = -totals.totalBorrowingYield / denominator;
	const rewards = totals.totalRewardYield / denominator;
	const intrinsicApy = totals.totalIntrinsicYield / denominator;

	return {
		lending,
		borrowing,
		rewards,
		intrinsicApy,
		total: totals.totalNetYield / denominator,
	};
}

function zeroYieldApyBreakdown(): YieldApyBreakdown {
	return {
		lending: 0,
		borrowing: 0,
		rewards: 0,
		intrinsicApy: 0,
		total: 0,
	};
}

/** Duck-type supply APY from a vault entity (percentage points). */
function getVaultSupplyApy(vault: any): number | undefined {
	if (vault.interestRates?.supplyAPY != null) {
		const val =
			typeof vault.interestRates.supplyAPY === "number"
				? vault.interestRates.supplyAPY
				: parseFloat(vault.interestRates.supplyAPY);
		return Number.isFinite(val) ? val : undefined;
	}
	// EulerEarn: supplyApy1h (percentage points)
	if (typeof vault.supplyApy1h === "number") {
		return Number.isFinite(vault.supplyApy1h) ? vault.supplyApy1h : undefined;
	}
	return undefined;
}

/** Duck-type borrow APY from a vault entity (EVault only). */
function getVaultBorrowApy(vault: any): number | undefined {
	if (vault.interestRates?.borrowAPY != null) {
		const val =
			typeof vault.interestRates.borrowAPY === "number"
				? vault.interestRates.borrowAPY
				: parseFloat(vault.interestRates.borrowAPY);
		return Number.isFinite(val) ? val : undefined;
	}
	return undefined;
}

/** Intrinsic APY as percentage points from vault's populated intrinsicApy field. */
function getVaultIntrinsicApy(vault: any): number {
	if (
		vault.intrinsicApy?.apy != null &&
		typeof vault.intrinsicApy.apy === "number"
	) {
		return vault.intrinsicApy.apy;
	}
	return 0;
}

function getIntrinsicApyContribution(
	baseApy: number,
	intrinsicApy: number,
): number {
	return (1 + baseApy / 100) * intrinsicApy;
}

/** Sum reward APRs for a given action as percentage points from vault campaigns. */
function getVaultRewardApr(vault: any, action: string): number {
	if (!vault.rewards?.campaigns) return 0;
	let total = 0;
	for (const c of vault.rewards.campaigns) {
		if (c.action === action && typeof c.apr === "number") {
			total += c.apr * 100;
		}
	}
	return total;
}
