import { decodeAbiParameters, formatUnits, type Hex } from "viem";

export enum InterestRateModelType {
	UNKNOWN = 0,
	KINK = 1,
	ADAPTIVE_CURVE = 2,
	KINKY = 3,
	FIXED_CYCLICAL_BINARY = 4,
}

export interface KinkIRMInfo {
	baseRate: bigint;
	slope1: bigint;
	slope2: bigint;
	kink: bigint;
}

export interface LinearKinkIRMParams {
	kinkPct: number;
	baseBorrowAPY: number;
	kinkBorrowAPY: number;
	maxBorrowAPY: number;
	baseSupplyAPY: number;
	kinkSupplyAPY: number;
	maxSupplyAPY: number;
}

export interface AdaptiveCurveIRMInfo {
	targetUtilization: bigint;
	initialRateAtTarget: bigint;
	minRateAtTarget: bigint;
	maxRateAtTarget: bigint;
	curveSteepness: bigint;
	adjustmentSpeed: bigint;
}

export interface KinkyIRMInfo {
	baseRate: bigint;
	slope: bigint;
	shape: bigint;
	kink: bigint;
	cutoff: bigint;
}

export interface FixedCyclicalBinaryIRMInfo {
	primaryRate: bigint;
	secondaryRate: bigint;
	primaryDuration: bigint;
	secondaryDuration: bigint;
	startTimestamp: bigint;
}

export type IRMParams =
	| KinkIRMInfo
	| AdaptiveCurveIRMInfo
	| KinkyIRMInfo
	| FixedCyclicalBinaryIRMInfo;

const UINT32_MAX = 2n ** 32n - 1n;
const SECONDS_PER_YEAR = 31_556_952;

/**
 * Decodes IRM parameters from the encoded bytes returned by IRMLens.getInterestRateModelInfo
 * @param type The interest rate model type
 * @param params The encoded parameters as a hex string
 * @returns The decoded IRM parameters matching the specified type
 * @throws Error if the type is UNKNOWN or invalid
 */
export function decodeIRMParams(
	type: InterestRateModelType,
	params: Hex,
): IRMParams {
	switch (type) {
		case InterestRateModelType.KINK: {
			const [baseRate, slope1, slope2, kink] = decodeAbiParameters(
				[
					{ name: "baseRate", type: "uint256" },
					{ name: "slope1", type: "uint256" },
					{ name: "slope2", type: "uint256" },
					{ name: "kink", type: "uint256" },
				],
				params,
			);
			return { baseRate, slope1, slope2, kink };
		}

		case InterestRateModelType.ADAPTIVE_CURVE: {
			const [
				targetUtilization,
				initialRateAtTarget,
				minRateAtTarget,
				maxRateAtTarget,
				curveSteepness,
				adjustmentSpeed,
			] = decodeAbiParameters(
				[
					{ name: "targetUtilization", type: "int256" },
					{ name: "initialRateAtTarget", type: "int256" },
					{ name: "minRateAtTarget", type: "int256" },
					{ name: "maxRateAtTarget", type: "int256" },
					{ name: "curveSteepness", type: "int256" },
					{ name: "adjustmentSpeed", type: "int256" },
				],
				params,
			);
			return {
				targetUtilization,
				initialRateAtTarget,
				minRateAtTarget,
				maxRateAtTarget,
				curveSteepness,
				adjustmentSpeed,
			};
		}

		case InterestRateModelType.KINKY: {
			const [baseRate, slope, shape, kink, cutoff] = decodeAbiParameters(
				[
					{ name: "baseRate", type: "uint256" },
					{ name: "slope", type: "uint256" },
					{ name: "shape", type: "uint256" },
					{ name: "kink", type: "uint256" },
					{ name: "cutoff", type: "uint256" },
				],
				params,
			);
			return { baseRate, slope, shape, kink, cutoff };
		}

		case InterestRateModelType.FIXED_CYCLICAL_BINARY: {
			const [
				primaryRate,
				secondaryRate,
				primaryDuration,
				secondaryDuration,
				startTimestamp,
			] = decodeAbiParameters(
				[
					{ name: "primaryRate", type: "uint256" },
					{ name: "secondaryRate", type: "uint256" },
					{ name: "primaryDuration", type: "uint256" },
					{ name: "secondaryDuration", type: "uint256" },
					{ name: "startTimestamp", type: "uint256" },
				],
				params,
			);
			return {
				primaryRate,
				secondaryRate,
				primaryDuration,
				secondaryDuration,
				startTimestamp,
			};
		}

		default:
			throw new Error(
				`Cannot decode IRM params for type: ${InterestRateModelType[type]}`,
			);
	}
}

export function normalizeIRMParams(
	type: InterestRateModelType,
	data: unknown,
): IRMParams | null {
	if (!data || typeof data !== "object") return null;

	switch (type) {
		case InterestRateModelType.KINK: {
			const baseRate = toBigIntValue(data, "baseRate");
			const slope1 = toBigIntValue(data, "slope1");
			const slope2 = toBigIntValue(data, "slope2");
			const kink = toBigIntValue(data, "kink");
			return baseRate !== null &&
				slope1 !== null &&
				slope2 !== null &&
				kink !== null
				? { baseRate, slope1, slope2, kink }
				: null;
		}

		case InterestRateModelType.ADAPTIVE_CURVE: {
			const targetUtilization = toBigIntValue(data, "targetUtilization");
			const initialRateAtTarget = toBigIntValue(data, "initialRateAtTarget");
			const minRateAtTarget = toBigIntValue(data, "minRateAtTarget");
			const maxRateAtTarget = toBigIntValue(data, "maxRateAtTarget");
			const curveSteepness = toBigIntValue(data, "curveSteepness");
			const adjustmentSpeed = toBigIntValue(data, "adjustmentSpeed");
			return targetUtilization !== null &&
				initialRateAtTarget !== null &&
				minRateAtTarget !== null &&
				maxRateAtTarget !== null &&
				curveSteepness !== null &&
				adjustmentSpeed !== null
				? {
						targetUtilization,
						initialRateAtTarget,
						minRateAtTarget,
						maxRateAtTarget,
						curveSteepness,
						adjustmentSpeed,
					}
				: null;
		}

		case InterestRateModelType.KINKY: {
			const baseRate = toBigIntValue(data, "baseRate");
			const slope = toBigIntValue(data, "slope");
			const shape = toBigIntValue(data, "shape");
			const kink = toBigIntValue(data, "kink");
			const cutoff = toBigIntValue(data, "cutoff");
			return baseRate !== null &&
				slope !== null &&
				shape !== null &&
				kink !== null &&
				cutoff !== null
				? { baseRate, slope, shape, kink, cutoff }
				: null;
		}

		case InterestRateModelType.FIXED_CYCLICAL_BINARY: {
			const primaryRate = toBigIntValue(data, "primaryRate");
			const secondaryRate = toBigIntValue(data, "secondaryRate");
			const primaryDuration = toBigIntValue(data, "primaryDuration");
			const secondaryDuration = toBigIntValue(data, "secondaryDuration");
			const startTimestamp = toBigIntValue(data, "startTimestamp");
			return primaryRate !== null &&
				secondaryRate !== null &&
				primaryDuration !== null &&
				secondaryDuration !== null &&
				startTimestamp !== null
				? {
						primaryRate,
						secondaryRate,
						primaryDuration,
						secondaryDuration,
						startTimestamp,
					}
				: null;
		}

		default:
			return null;
	}
}

export function decorateIRMParams(
	type: InterestRateModelType.KINK,
	data: KinkIRMInfo | null,
	interestFee: number,
): LinearKinkIRMParams | null;
export function decorateIRMParams(
	type: InterestRateModelType.ADAPTIVE_CURVE,
	data: AdaptiveCurveIRMInfo | null,
	interestFee: number,
): null;
export function decorateIRMParams(
	type: InterestRateModelType.KINKY,
	data: KinkyIRMInfo | null,
	interestFee: number,
): null;
export function decorateIRMParams(
	type: InterestRateModelType.FIXED_CYCLICAL_BINARY,
	data: FixedCyclicalBinaryIRMInfo | null,
	interestFee: number,
): null;
export function decorateIRMParams(
	type: InterestRateModelType,
	data: IRMParams | null,
	interestFee: number,
): LinearKinkIRMParams | null;
export function decorateIRMParams(
	type: InterestRateModelType,
	data: IRMParams | null,
	interestFee: number,
): LinearKinkIRMParams | null {
	if (!data) return null;

	switch (type) {
		case InterestRateModelType.KINK: {
			const kinkData = data as KinkIRMInfo;
			const baseSPY = kinkData.baseRate;
			const kinkSPY = kinkData.baseRate + kinkData.kink * kinkData.slope1;
			const maxSPY =
				kinkData.baseRate +
				kinkData.kink * kinkData.slope1 +
				(UINT32_MAX - kinkData.kink) * kinkData.slope2;
			const kinkUtilization = Number(kinkData.kink) / Number(UINT32_MAX);
			const baseBorrowAPY = spyToApyPercent(baseSPY);
			const kinkBorrowAPY = spyToApyPercent(kinkSPY);
			const maxBorrowAPY = spyToApyPercent(maxSPY);
			return {
				kinkPct: bigintToPercent(kinkData.kink, UINT32_MAX),
				baseBorrowAPY,
				kinkBorrowAPY,
				maxBorrowAPY,
				baseSupplyAPY: supplyApyFromBorrowApy(baseBorrowAPY, 0, interestFee),
				kinkSupplyAPY: supplyApyFromBorrowApy(
					kinkBorrowAPY,
					kinkUtilization,
					interestFee,
				),
				maxSupplyAPY: supplyApyFromBorrowApy(maxBorrowAPY, 1, interestFee),
			};
		}

		case InterestRateModelType.ADAPTIVE_CURVE:
		case InterestRateModelType.KINKY:
		case InterestRateModelType.FIXED_CYCLICAL_BINARY:
		default:
			return null;
	}
}

function toBigIntValue(data: object, key: string): bigint | null {
	const value = (data as Record<string, unknown>)[key];
	if (typeof value === "bigint") return value;
	if (typeof value === "string" || typeof value === "number") {
		try {
			return BigInt(value);
		} catch {
			return null;
		}
	}
	return null;
}

function spyToApyPercent(spy: bigint): number {
	const spyPerSecond = Number(formatUnits(spy, 27));
	if (!Number.isFinite(spyPerSecond)) return Number.POSITIVE_INFINITY;
	return (Math.pow(1 + spyPerSecond, SECONDS_PER_YEAR) - 1) * 100;
}

function bigintToPercent(value: bigint, scale: bigint): number {
	return Number(formatUnits(value * 10_000n, 2)) / Number(scale);
}

function supplyApyFromBorrowApy(
	borrowAPY: number,
	utilization: number,
	interestFee: number,
): number {
	return borrowAPY * utilization * (1 - interestFee);
}
