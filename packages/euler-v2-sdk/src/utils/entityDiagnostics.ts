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
  /** JSONPath-like, relative to the entity root object. */
  path: string;
  source?: string;
  originalValue?: unknown;
  normalizedValue?: unknown;
  timestampMs: number;
  handled: true;
}

export type DataIssueInput = Omit<DataIssue, "timestampMs" | "handled">;

const diagnosticsStore = new WeakMap<object, DataIssue[]>();

function getOrCreateStore(entity: object): DataIssue[] {
  let store = diagnosticsStore.get(entity);
  if (!store) {
    store = [];
    diagnosticsStore.set(entity, store);
  }
  return store;
}

export function addEntityDataIssue(entity: object, issue: DataIssueInput): void {
  const store = getOrCreateStore(entity);
  store.push({
    ...issue,
    timestampMs: Date.now(),
    handled: true,
  });
}

export function getEntityDataIssues(entity: object): readonly DataIssue[] {
  return diagnosticsStore.get(entity) ?? [];
}

export function getEntityDataIssuesAtPath(entity: object, path: string): readonly DataIssue[] {
  return getEntityDataIssues(entity).filter((issue) => issue.path === path);
}

export function hasEntityDataIssues(entity: object): boolean {
  return getEntityDataIssues(entity).length > 0;
}

export function transferEntityDataIssues(source: object, target: object): void {
  const sourceIssues = diagnosticsStore.get(source);
  if (!sourceIssues || sourceIssues.length === 0) return;
  const targetIssues = diagnosticsStore.get(target);
  if (!targetIssues || targetIssues.length === 0) {
    diagnosticsStore.set(target, [...sourceIssues]);
    return;
  }
  diagnosticsStore.set(target, [...targetIssues, ...sourceIssues]);
}

export interface DataIssueCollector {
  add(issue: DataIssueInput): void;
}

export function createDataIssueCollector(
  onIssue?: (issue: DataIssueInput) => void
): DataIssueCollector {
  return {
    add(issue: DataIssueInput): void {
      onIssue?.(issue);
    },
  };
}
