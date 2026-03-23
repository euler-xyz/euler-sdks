import { useSyncExternalStore } from "react";

type RowState = "active" | "fading";

interface CounterState {
  count: number;
  state: RowState;
  fadeStartTime: number | null;
  bufferTimer: ReturnType<typeof setTimeout> | null;
  fadeTimer: ReturnType<typeof setTimeout> | null;
}

interface Row {
  queryName: string;
  success: CounterState;
  error: CounterState;
}

export interface QueryRowSnapshot {
  queryName: string;
  successCount: number;
  successState: RowState;
  successFadeStartTime: number | null;
  errorCount: number;
  errorState: RowState;
  errorFadeStartTime: number | null;
}

const rows = new Map<string, Row>();
const knownQueries = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: QueryRowSnapshot[] = [];

function createCounterState(): CounterState {
  return {
    count: 0,
    state: "active",
    fadeStartTime: null,
    bufferTimer: null,
    fadeTimer: null,
  };
}

function emit() {
  snapshot = Array.from(knownQueries)
    .sort((a, b) => a.localeCompare(b))
    .map((queryName) => {
      const row = rows.get(queryName);
      if (!row) {
        return {
          queryName,
          successCount: 0,
          successState: "active" as const,
          successFadeStartTime: null,
          errorCount: 0,
          errorState: "active" as const,
          errorFadeStartTime: null,
        };
      }

      return {
        queryName: row.queryName,
        successCount: row.success.count,
        successState: row.success.state,
        successFadeStartTime: row.success.fadeStartTime,
        errorCount: row.error.count,
        errorState: row.error.state,
        errorFadeStartTime: row.error.fadeStartTime,
      };
    });
  for (const l of listeners) l();
}

function cleanupRow(queryName: string) {
  const row = rows.get(queryName);
  if (!row) return;

  const hasSuccessActivity =
    row.success.count > 0 ||
    row.success.bufferTimer !== null ||
    row.success.fadeTimer !== null;
  const hasErrorActivity =
    row.error.count > 0 ||
    row.error.bufferTimer !== null ||
    row.error.fadeTimer !== null;

  if (!hasSuccessActivity && !hasErrorActivity) {
    rows.delete(queryName);
  }
}

function startFade(queryName: string, type: "success" | "error") {
  const row = rows.get(queryName);
  if (!row) return;

  const counter = row[type];
  counter.state = "fading";
  counter.fadeStartTime = Date.now();
  counter.bufferTimer = null;

  counter.fadeTimer = setTimeout(() => {
    counter.count = 0;
    counter.state = "active";
    counter.fadeStartTime = null;
    counter.fadeTimer = null;
    cleanupRow(queryName);
    emit();
  }, 6000);

  emit();
}

function recordActivity(queryName: string, type: "success" | "error") {
  if (!knownQueries.has(queryName)) {
    knownQueries.add(queryName);
  }
  const existing = rows.get(queryName);

  if (existing) {
    const counter = existing[type];
    if (counter.bufferTimer) clearTimeout(counter.bufferTimer);
    if (counter.fadeTimer) clearTimeout(counter.fadeTimer);

    counter.count += 1;
    counter.state = "active";
    counter.fadeStartTime = null;
    counter.fadeTimer = null;
    counter.bufferTimer = setTimeout(() => startFade(queryName, type), 1000);
  } else {
    const row: Row = {
      queryName,
      success: createCounterState(),
      error: createCounterState(),
    };
    row[type].count = 1;
    row[type].bufferTimer = setTimeout(() => startFade(queryName, type), 1000);
    rows.set(queryName, row);
  }

  emit();
}

export function recordExecution(queryName: string) {
  recordActivity(queryName, "success");
}

export function recordFailure(queryName: string) {
  recordActivity(queryName, "error");
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

export function resetQueryProfile() {
  for (const row of rows.values()) {
    if (row.success.bufferTimer) clearTimeout(row.success.bufferTimer);
    if (row.success.fadeTimer) clearTimeout(row.success.fadeTimer);
    if (row.error.bufferTimer) clearTimeout(row.error.bufferTimer);
    if (row.error.fadeTimer) clearTimeout(row.error.fadeTimer);
  }

  rows.clear();
  knownQueries.clear();
  snapshot = [];
  emit();
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
