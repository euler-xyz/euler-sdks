import {
  addEntityDataIssue,
  type DataIssueCollector,
  type DataIssueInput,
} from "./entityDiagnostics.js";

export function emitNormalizationIssue(
  target: object,
  issue: DataIssueInput,
  collector?: DataIssueCollector
): void {
  addEntityDataIssue(target, issue);
  collector?.add(issue);
}

type BigintToSafeNumberParams = {
  path: string;
  target: object;
  source: string;
  collector?: DataIssueCollector;
  message?: string;
};

export function bigintToSafeNumber(value: bigint, params: BigintToSafeNumberParams): number {
  const { path, target, source } = params;

  if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(value);
  }

  const clamped = value > 0n ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
  emitNormalizationIssue(target, {
    code: "OUT_OF_RANGE_CLAMPED",
    severity: "warning",
    message:
      params.message ?? "BigInt value exceeded JavaScript safe number range and was clamped.",
    path,
    source,
    originalValue: value.toString(),
    normalizedValue: clamped,
  }, params.collector);
  return clamped;
}

type NumberLikeToSafeFiniteNumberParams = {
  path: string;
  target: object;
  source: string;
  collector?: DataIssueCollector;
  fallback?: number;
  message?: string;
};

export function numberLikeToSafeFiniteNumber(
  value: bigint | number,
  params: NumberLikeToSafeFiniteNumberParams
): number {
  const fallback = params.fallback ?? 0;

  if (typeof value === "bigint") {
    return bigintToSafeNumber(value, {
      path: params.path,
      target: params.target,
      source: params.source,
      collector: params.collector,
      message: params.message,
    });
  }

  if (Number.isFinite(value)) return value;

  emitNormalizationIssue(params.target, {
    code: "DEFAULT_APPLIED",
    severity: "warning",
    message: params.message ?? "Non-finite number encountered and fallback value applied.",
    path: params.path,
    source: params.source,
    originalValue: String(value),
    normalizedValue: fallback,
  }, params.collector);
  return fallback;
}

type BigintToScaledNumberParams = {
  path: string;
  target: object;
  source: string;
  collector?: DataIssueCollector;
  scale: number;
  maxUnscaled?: bigint;
  minUnscaled?: bigint;
  overflowMessage?: string;
};

export function bigintToScaledNumber(value: bigint, params: BigintToScaledNumberParams): number {
  const { path, target, source, maxUnscaled, minUnscaled, scale } = params;

  if (maxUnscaled !== undefined && value > maxUnscaled) {
    emitNormalizationIssue(target, {
      code: "OUT_OF_RANGE_CLAMPED",
      severity: "warning",
      message: params.overflowMessage ?? "Value exceeded maximum allowed range and was clamped.",
      path,
      source,
      originalValue: value.toString(),
      normalizedValue: maxUnscaled.toString(),
    }, params.collector);
    return Number(maxUnscaled) / scale;
  }

  if (minUnscaled !== undefined && value < minUnscaled) {
    emitNormalizationIssue(target, {
      code: "OUT_OF_RANGE_CLAMPED",
      severity: "warning",
      message: params.overflowMessage ?? "Value exceeded minimum allowed range and was clamped.",
      path,
      source,
      originalValue: value.toString(),
      normalizedValue: minUnscaled.toString(),
    }, params.collector);
    return Number(minUnscaled) / scale;
  }

  return Number(value) / scale;
}
