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
  path: string;
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

export function prefixDataIssues(errors: DataIssue[], prefix: string): DataIssue[] {
  return errors.map((issue) => ({
    ...issue,
    path: withPathPrefix(issue.path, prefix),
  }));
}
