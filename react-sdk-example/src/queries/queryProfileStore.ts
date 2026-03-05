import { useSyncExternalStore } from "react";

type RowState = "active" | "fading";

interface Row {
  queryName: string;
  count: number;
  state: RowState;
  fadeStartTime: number | null;
  bufferTimer: ReturnType<typeof setTimeout> | null;
  fadeTimer: ReturnType<typeof setTimeout> | null;
}

export interface QueryRowSnapshot {
  queryName: string;
  count: number;
  state: RowState;
  fadeStartTime: number | null;
}

const rows = new Map<string, Row>();
const knownQueries = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: QueryRowSnapshot[] = [];

function emit() {
  snapshot = Array.from(knownQueries)
    .sort((a, b) => a.localeCompare(b))
    .map((queryName) => {
      const row = rows.get(queryName);
      if (!row) {
        return {
          queryName,
          count: 0,
          state: "active" as const,
          fadeStartTime: null,
        };
      }

      return {
        queryName: row.queryName,
        count: row.count,
        state: row.state,
        fadeStartTime: row.fadeStartTime,
      };
    });
  for (const l of listeners) l();
}

function startFade(queryName: string) {
  const row = rows.get(queryName);
  if (!row) return;

  row.state = "fading";
  row.fadeStartTime = Date.now();
  row.bufferTimer = null;

  row.fadeTimer = setTimeout(() => {
    rows.delete(queryName);
    emit();
  }, 3000);

  emit();
}

export function recordExecution(queryName: string) {
  if (!knownQueries.has(queryName)) {
    knownQueries.add(queryName);
  }
  const existing = rows.get(queryName);

  if (existing) {
    if (existing.bufferTimer) clearTimeout(existing.bufferTimer);
    if (existing.fadeTimer) clearTimeout(existing.fadeTimer);

    existing.count += 1;
    existing.state = "active";
    existing.fadeStartTime = null;
    existing.fadeTimer = null;
    existing.bufferTimer = setTimeout(() => startFade(queryName), 1000);
  } else {
    const row: Row = {
      queryName,
      count: 1,
      state: "active",
      fadeStartTime: null,
      bufferTimer: setTimeout(() => startFade(queryName), 1000),
      fadeTimer: null,
    };
    rows.set(queryName, row);
  }

  emit();
}

export function registerKnownQueries(queryNames: string[]) {
  let changed = false;
  for (const queryName of queryNames) {
    if (!knownQueries.has(queryName)) {
      knownQueries.add(queryName);
      changed = true;
    }
  }

  if (changed) emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): QueryRowSnapshot[] {
  return snapshot;
}

export function useQueryProfile(): QueryRowSnapshot[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
