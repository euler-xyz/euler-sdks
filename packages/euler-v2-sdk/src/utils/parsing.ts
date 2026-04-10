import { formatUnits, type Address, getAddress } from "viem";
import type { DataIssue } from "./entityDiagnostics.js";

export type DiagnosticsParserParams = {
	path: string;
	entityId: Address;
	errors: DataIssue[];
	source: string;
};

export type DaysToLiquidationValue = "Infinity" | "MoreThanAYear" | number;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export function parseBigIntField(
	value: string | undefined,
	params: DiagnosticsParserParams,
): bigint {
	try {
		if (typeof value !== "string") throw new Error("invalid bigint input");
		return BigInt(value);
	} catch {
		params.errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: `Failed to parse bigint at ${params.path}; defaulted to 0.`,
			paths: [params.path],
			entityId: params.entityId,
			source: params.source,
			originalValue: value,
			normalizedValue: "0",
		});
		return 0n;
	}
}

export function parseRatio1e4(
	value: string | undefined,
	params: DiagnosticsParserParams,
): number {
	const parsed = Number(value);
	if (Number.isFinite(parsed)) return parsed / 1e4;

	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Failed to parse ratio at ${params.path}; defaulted to 0.`,
		paths: [params.path],
		entityId: params.entityId,
		source: params.source,
		originalValue: value,
		normalizedValue: 0,
	});
	return 0;
}

export function parseAddressField(
	value: string | undefined,
	params: DiagnosticsParserParams & {
		fallback?: Address;
		fallbackLabel?: string;
	},
): Address {
	if (value) {
		try {
			return getAddress(value);
		} catch {
			// handled below
		}
	}

	const fallback = params.fallback ?? ZERO_ADDRESS;
	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Missing or invalid address at ${params.path}; defaulted to ${params.fallbackLabel ?? "zero address"}.`,
		paths: [params.path],
		entityId: params.entityId,
		source: params.source,
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
}

export function parseAddressArrayField(
	value: string[] | undefined,
	params: DiagnosticsParserParams,
): Address[] {
	if (!Array.isArray(value)) {
		params.errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: `Missing address array at ${params.path}; defaulted to empty array.`,
			paths: [params.path],
			entityId: params.entityId,
			source: params.source,
			originalValue: value,
			normalizedValue: [],
		});
		return [];
	}

	return value.map((entry, index) =>
		parseAddressField(entry, {
			...params,
			path: `${params.path}[${index}]`,
		}),
	);
}

export function parseStringField(
	value: string | undefined,
	params: DiagnosticsParserParams & {
		fallback?: string;
	},
): string {
	const fallback = params.fallback ?? "";
	if (typeof value === "string") return value;

	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Missing string at ${params.path}; defaulted to ${JSON.stringify(fallback)}.`,
		paths: [params.path],
		entityId: params.entityId,
		source: params.source,
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
}

export function parseNumberField(
	value: number | undefined,
	params: DiagnosticsParserParams & {
		fallback?: number;
	},
): number {
	const fallback = params.fallback ?? 0;
	if (typeof value === "number" && Number.isFinite(value)) return value;

	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Missing or invalid number at ${params.path}; defaulted to ${fallback}.`,
		paths: [params.path],
		entityId: params.entityId,
		source: params.source,
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
}

export function parseBooleanField(
	value: boolean | undefined,
	params: DiagnosticsParserParams & {
		fallback?: boolean;
	},
): boolean {
	const fallback = params.fallback ?? false;
	if (typeof value === "boolean") return value;

	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Missing boolean at ${params.path}; defaulted to ${fallback}.`,
		paths: [params.path],
		entityId: params.entityId,
		source: params.source,
		originalValue: value,
		normalizedValue: fallback,
	});
	return fallback;
}

export function parseDaysToLiquidation(
	value: number | string,
	params: DiagnosticsParserParams,
): DaysToLiquidationValue {
	if (value === "Infinity" || value === "MoreThanAYear") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}

	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Failed to parse daysToLiquidation at ${params.path}; defaulted to Infinity.`,
		paths: [params.path],
		entityId: params.entityId,
		source: params.source,
		originalValue: String(value),
		normalizedValue: "Infinity",
	});
	return "Infinity";
}

export function parseTimestampField(
	value: string | undefined,
	params: DiagnosticsParserParams,
): number {
	if (!value) {
		params.errors.push({
			code: "DEFAULT_APPLIED",
			severity: "warning",
			message: `Missing timestamp at ${params.path}; defaulted to 0.`,
			paths: [params.path],
			entityId: params.entityId,
			source: params.source,
			normalizedValue: 0,
		});
		return 0;
	}

	const parsed = Date.parse(value);
	if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);

	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Failed to parse timestamp at ${params.path}; defaulted to 0.`,
		paths: [params.path],
		entityId: params.entityId,
		source: params.source,
		originalValue: value,
		normalizedValue: 0,
	});
	return 0;
}

export function parsePerformanceFee(
	value: string | undefined,
	params: DiagnosticsParserParams,
): number {
	try {
		const parsed = Number(formatUnits(BigInt(value ?? "0"), 18));
		if (Number.isFinite(parsed)) return parsed;
	} catch {
		// handled below
	}

	params.errors.push({
		code: "DEFAULT_APPLIED",
		severity: "warning",
		message: `Failed to parse performance fee at ${params.path}; defaulted to 0.`,
		paths: [params.path],
		entityId: params.entityId,
		source: params.source,
		originalValue: value,
		normalizedValue: 0,
	});
	return 0;
}
