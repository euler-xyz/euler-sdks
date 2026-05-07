import type { DiagnosticIssue } from "../queries/sdkQueries.ts";
import type { DataIssueLocation } from "@eulerxyz/euler-v2-sdk";

type IndexedIssue = {
  issue: DiagnosticIssue;
  path: string;
};

type CreateEntityDiagnosticIndexParams = {
  diagnostics: DiagnosticIssue[];
  resolveLocationKey: (
    location: DataIssueLocation,
    issue: DiagnosticIssue
  ) => string | undefined;
  normalizePath?: (
    path: string | undefined,
    location: DataIssueLocation,
    issue: DiagnosticIssue
  ) => string | undefined;
};

function getIssueLocations(issue: DiagnosticIssue): DataIssueLocation[] {
  return issue.locations?.length ? issue.locations : [];
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

function uniqueIssues(entries: IndexedIssue[]): DiagnosticIssue[] {
  const seen = new Set<DiagnosticIssue>();
  const issues: DiagnosticIssue[] = [];
  for (const { issue } of entries) {
    if (seen.has(issue)) continue;
    seen.add(issue);
    issues.push(issue);
  }
  return issues;
}

export function formatDiagnosticIssues(issues: DiagnosticIssue[]): string {
  return issues.map((issue) => JSON.stringify(issue, null, 2)).join("\n\n");
}

export function createEntityDiagnosticIndex({
  diagnostics,
  resolveLocationKey,
  normalizePath,
}: CreateEntityDiagnosticIndexParams) {
  const byEntity = new Map<string, IndexedIssue[]>();

  for (const issue of diagnostics) {
    if (!isVisibleIssue(issue)) continue;
    for (const location of getIssueLocations(issue)) {
      const entityKey = resolveLocationKey(location, issue);
      if (!entityKey) continue;

      const list = byEntity.get(entityKey) ?? [];
      const path = normalizeIssuePath(
        normalizePath ? normalizePath(location.path, location, issue) : location.path
      );
      list.push({ issue, path });
      byEntity.set(entityKey, list);
    }
  }

  const getEntityIssues = (entityKey: string): DiagnosticIssue[] =>
    uniqueIssues(byEntity.get(entityKey) ?? []);

  const getFieldIssues = (entityKey: string, targetPaths: string[]): DiagnosticIssue[] => {
    const entries = byEntity.get(entityKey);
    if (!entries || targetPaths.length === 0) return [];
    return uniqueIssues(
      entries.filter((entry) => targetPaths.some((target) => matchesPath(entry.path, target)))
    );
  };

  const getExactFieldIssues = (entityKey: string, targetPaths: string[]): DiagnosticIssue[] => {
    const entries = byEntity.get(entityKey);
    if (!entries || targetPaths.length === 0) return [];
    return uniqueIssues(
      entries.filter((entry) => targetPaths.some((target) => entry.path === target))
    );
  };

  return { getEntityIssues, getFieldIssues, getExactFieldIssues };
}
