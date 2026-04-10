export type DataIssueSeverity = "info" | "warning" | "error";

export type DataIssueCode =
	| "COERCED_TYPE"
	| "OUT_OF_RANGE_CLAMPED"
	| "OUT_OF_RANGE_DROPPED"
	| "PRECISION_LOSS"
	| "DEFAULT_APPLIED"
	| "SOURCE_UNAVAILABLE"
	| "FALLBACK_USED"
	| "DECODE_FAILED";

export interface DataIssue {
	code: DataIssueCode;
	severity: DataIssueSeverity;
	message: string;
	/** JSONPath-like, relative to a fetch result root entity. */
	paths: string[];
	/** Stable entity identifier (address for vault/account/subaccount/wallet/asset when known). */
	entityId?: string;
	source?: string;
	originalValue?: unknown;
	normalizedValue?: unknown;
}

export interface ServiceResult<T> {
	result: T;
	errors: DataIssue[];
}

export function withPathPrefix(path: string, prefix: string): string {
	if (!prefix || prefix === "$") return path;
	if (path === "$") return prefix;
	if (path.startsWith("$.")) return `${prefix}${path.slice(1)}`;
	if (path.startsWith("$[")) return `${prefix}${path.slice(1)}`;
	return `${prefix}.${path}`;
}

function uniquePaths(paths: string[]): string[] {
	return Array.from(new Set(paths));
}

export function mapDataIssuePaths(
	issue: DataIssue,
	mapPath: (path: string) => string,
): DataIssue {
	return {
		...issue,
		paths: uniquePaths(issue.paths.map(mapPath)),
	};
}

export function prefixDataIssue(issue: DataIssue, prefix: string): DataIssue {
	return mapDataIssuePaths(issue, (path) => withPathPrefix(path, prefix));
}

export function prefixDataIssues(
	errors: DataIssue[],
	prefix: string,
): DataIssue[] {
	return errors.map((issue) => prefixDataIssue(issue, prefix));
}

/**
 * Normalizes list-root diagnostics like "$.vaults[0].x" to "$[0].x" for
 * service methods that return top-level arrays.
 */
export function normalizeTopLevelVaultArrayPath(path: string): string {
	return path.replace(
		/^\$\.(?:vaults|eVaults|eulerEarns)\[(\d+)\](?=\.|$)/,
		(_match, index: string) => `$[${index}]`,
	);
}

function stableSerialize(value: unknown): string {
	if (typeof value === "bigint") return `bigint:${value.toString()}`;
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(
				([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`,
			);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value);
}

export function compressDataIssues(errors: DataIssue[]): DataIssue[] {
	const byFingerprint = new Map<string, DataIssue>();

	for (const issue of errors) {
		const fingerprint = stableSerialize({
			code: issue.code,
			severity: issue.severity,
			message: issue.message,
			entityId: issue.entityId,
			source: issue.source,
			originalValue: issue.originalValue,
			normalizedValue: issue.normalizedValue,
		});
		const existing = byFingerprint.get(fingerprint);
		if (!existing) {
			byFingerprint.set(fingerprint, {
				...issue,
				paths: uniquePaths(issue.paths),
			});
			continue;
		}

		existing.paths = uniquePaths([...existing.paths, ...issue.paths]);
	}

	return Array.from(byFingerprint.values());
}
