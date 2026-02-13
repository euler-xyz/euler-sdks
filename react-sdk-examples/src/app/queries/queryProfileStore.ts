"use client";

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
const listeners = new Set<() => void>();
let snapshot: QueryRowSnapshot[] = [];

function emit() {
  snapshot = Array.from(rows.values()).map((r) => ({
    queryName: r.queryName,
    count: r.count,
    state: r.state,
    fadeStartTime: r.fadeStartTime,
  }));
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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): QueryRowSnapshot[] {
  return snapshot;
}

function getServerSnapshot(): QueryRowSnapshot[] {
  return [];
}

export function useQueryProfile(): QueryRowSnapshot[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
