import type { DataIssue } from "./entityDiagnostics.js";

type BigintToSafeNumberParams = {
	path: string;
	errors: DataIssue[];
	source: string;
	entityId?: string;
	message?: string;
};

export function bigintToSafeNumber(
	value: bigint,
	params: BigintToSafeNumberParams,
): number {
	const { path, errors, source, entityId } = params;

	if (
		value <= BigInt(Number.MAX_SAFE_INTEGER) &&
		value >= BigInt(Number.MIN_SAFE_INTEGER)
	) {
		return Number(value);
	}

	const clamped =
		value > 0n ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
	errors.push({
		code: "OUT_OF_RANGE_CLAMPED",
		severity: "warning",
		message:
			params.message ??
			"BigInt value exceeded JavaScript safe number range and was clamped.",
		paths: [path],
		source,
		entityId,
		originalValue: value.toString(),
		normalizedValue: clamped,
	});
	return clamped;
}

type NumberLikeToSafeFiniteNumberParams = {
	path: string;
	errors: DataIssue[];
	source: string;
	entityId?: string;
	fallback?: number;
	message?: string;
};

export function numberLikeToSafeFiniteNumber(
	value: bigint | number,
	params: NumberLikeToSafeFiniteNumberParams,
): number {
	const fallback = params.fallback ?? 0;

	if (typeof value === "bigint") {
		return bigintToSafeNumber(value, {
			path: params.path,
			errors: params.errors,
			source: params.source,
			entityId: params.entityId,
			message: params.message,
		});
	}

	if (Number.isFinite(value)) return value;

	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message:
			params.message ??
			"Non-finite number encountered and fallback value applied.",
		paths: [params.path],
		source: params.source,
		entityId: params.entityId,
		originalValue: String(value),
		normalizedValue: fallback,
	});
	return fallback;
}

type BigintToScaledNumberParams = {
	path: string;
	errors: DataIssue[];
	source: string;
	entityId?: string;
	scale: number;
	maxUnscaled?: bigint;
	minUnscaled?: bigint;
	overflowMessage?: string;
};

export function bigintToScaledNumber(
	value: bigint,
	params: BigintToScaledNumberParams,
): number {
	const { path, errors, source, entityId, maxUnscaled, minUnscaled, scale } =
		params;

	if (maxUnscaled !== undefined && value > maxUnscaled) {
		errors.push({
			code: "OUT_OF_RANGE_CLAMPED",
			severity: "warning",
			message:
				params.overflowMessage ??
				"Value exceeded maximum allowed range and was clamped.",
			paths: [path],
			source,
			entityId,
			originalValue: value.toString(),
			normalizedValue: maxUnscaled.toString(),
		});
		return Number(maxUnscaled) / scale;
	}

	if (minUnscaled !== undefined && value < minUnscaled) {
		errors.push({
			code: "OUT_OF_RANGE_CLAMPED",
			severity: "warning",
			message:
				params.overflowMessage ??
				"Value exceeded minimum allowed range and was clamped.",
			paths: [path],
			source,
			entityId,
			originalValue: value.toString(),
			normalizedValue: minUnscaled.toString(),
		});
		return Number(minUnscaled) / scale;
	}

	return Number(value) / scale;
}

export function bigintPercentage(
	numerator: bigint,
	denominator: bigint,
	precision = 4,
): number {
	if (denominator <= 0n) return numerator > 0n ? 100 : 0;
	const scale = 10n ** BigInt(precision);
	const scaled = (numerator * scale * 100n) / denominator;
	const whole = scaled / scale;
	const fraction = scaled % scale;
	return Number.parseFloat(
		`${whole}.${fraction.toString().padStart(precision, "0")}`,
	);
}
