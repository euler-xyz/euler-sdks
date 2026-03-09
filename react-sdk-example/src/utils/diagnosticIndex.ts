import type { DiagnosticIssue } from "../queries/sdkQueries.ts";

type IndexedIssue = {
  issue: DiagnosticIssue;
  path: string;
};

type CreateEntityDiagnosticIndexParams = {
  diagnostics: DiagnosticIssue[];
  resolveEntityKey: (issue: DiagnosticIssue) => string | undefined;
  normalizePath?: (path: string | undefined) => string | undefined;
};

function getIssuePaths(issue: DiagnosticIssue): string[] {
  return issue.paths?.length ? issue.paths : ["$"];
}

function isVisibleIssue(issue: DiagnosticIssue): boolean {
  return issue.severity === "warning" || issue.severity === "error";
}

function normalizeIssuePath(path: string | undefined): string {
  if (!path) return "$";
  return path;
}

function matchesPath(path: string, target: string): boolean {
  return (
    path === target ||
    path.startsWith(`${target}.`) ||
    path.startsWith(`${target}[`)
  );
}

export function formatDiagnosticIssues(issues: DiagnosticIssue[]): string {
  return issues.map((issue) => JSON.stringify(issue, null, 2)).join("\n\n");
}

export function createEntityDiagnosticIndex({
  diagnostics,
  resolveEntityKey,
  normalizePath,
}: CreateEntityDiagnosticIndexParams) {
  const byEntity = new Map<string, IndexedIssue[]>();

  for (const issue of diagnostics) {
    if (!isVisibleIssue(issue)) continue;
    const entityKey = resolveEntityKey(issue);
    if (!entityKey) continue;

    const list = byEntity.get(entityKey) ?? [];
    for (const issuePath of getIssuePaths(issue)) {
      const path = normalizeIssuePath(normalizePath ? normalizePath(issuePath) : issuePath);
      list.push({ issue, path });
    }
    byEntity.set(entityKey, list);
  }

  const getEntityIssues = (entityKey: string): DiagnosticIssue[] =>
    (byEntity.get(entityKey) ?? []).map((entry) => entry.issue);

  const getFieldIssues = (entityKey: string, paths: string[]): DiagnosticIssue[] => {
    const entries = byEntity.get(entityKey);
    if (!entries || paths.length === 0) return [];
    return entries
      .filter((entry) => paths.some((target) => matchesPath(entry.path, target)))
      .map((entry) => entry.issue);
  };

  const getExactFieldIssues = (entityKey: string, paths: string[]): DiagnosticIssue[] => {
    const entries = byEntity.get(entityKey);
    if (!entries || paths.length === 0) return [];
    return entries
      .filter((entry) => paths.some((target) => entry.path === target))
      .map((entry) => entry.issue);
  };

  return { getEntityIssues, getFieldIssues, getExactFieldIssues };
}
