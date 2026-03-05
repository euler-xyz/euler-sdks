import { useSyncExternalStore } from "react";

const STORAGE_KEY = "sdk-data-interceptor-selected-queries";
const BIGINT_PREFIX = "__interceptor_bigint__:";

type InterceptionRequest = {
  id: number;
  queryName: string;
  originalData: unknown;
  initialText: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type ActiveInterceptionSnapshot = {
  id: number;
  queryName: string;
  initialText: string;
} | null;

let selectedQueries = readSelectedQueriesFromStorage();
let nextId = 1;
let activeRequest: InterceptionRequest | null = null;
let activeSnapshot: ActiveInterceptionSnapshot = null;
const queue: InterceptionRequest[] = [];
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSelectedQueriesFromStorage() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return new Set<string>();
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((queryName) => typeof queryName === "string"));
  } catch {
    return new Set<string>();
  }
}

function writeSelectedQueriesToStorage(value: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(value)));
}

function toEditableText(value: unknown): string {
  try {
    const text = JSON.stringify(
      value,
      (_, currentValue) =>
        typeof currentValue === "bigint"
          ? `${BIGINT_PREFIX}${currentValue.toString()}`
          : currentValue,
      2
    );
    return text ?? "null";
  } catch {
    return "null";
  }
}

function parseEditedText(text: string): unknown {
  return JSON.parse(text, (_, value) => {
    if (typeof value !== "string") return value;
    if (!value.startsWith(BIGINT_PREFIX)) return value;
    return BigInt(value.slice(BIGINT_PREFIX.length));
  });
}

function currentSnapshot(): ActiveInterceptionSnapshot {
  return activeSnapshot;
}

function activateNext() {
  if (activeRequest || queue.length === 0) return;
  activeRequest = queue.shift() ?? null;
  activeSnapshot = activeRequest
    ? {
        id: activeRequest.id,
        queryName: activeRequest.queryName,
        initialText: activeRequest.initialText,
      }
    : null;
}

function clearActiveAndAdvance() {
  activeRequest = null;
  activeSnapshot = null;
  activateNext();
  emitChange();
}

function flushPendingWithOriginalData() {
  if (activeRequest) {
    activeRequest.resolve(activeRequest.originalData);
  }
  for (const request of queue) {
    request.resolve(request.originalData);
  }
  queue.length = 0;
  activeRequest = null;
  activeSnapshot = null;
}

function flushRequestsForQuery(queryName: string) {
  if (activeRequest?.queryName === queryName) {
    activeRequest.resolve(activeRequest.originalData);
    activeRequest = null;
    activeSnapshot = null;
  }

  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const request = queue[index];
    if (request.queryName !== queryName) continue;
    request.resolve(request.originalData);
    queue.splice(index, 1);
  }

  activateNext();
}

export function useSelectedInterceptedQueries() {
  return useSyncExternalStore(
    subscribe,
    () => selectedQueries,
    () => selectedQueries
  );
}

export function isQueryIntercepted(queryName: string): boolean {
  return selectedQueries.has(queryName);
}

export function setQueryIntercepted(queryName: string, value: boolean) {
  if (value) {
    selectedQueries = new Set(selectedQueries).add(queryName);
  } else {
    const next = new Set(selectedQueries);
    next.delete(queryName);
    selectedQueries = next;
    flushRequestsForQuery(queryName);
  }

  writeSelectedQueriesToStorage(selectedQueries);
  emitChange();
}

export function setInterceptedQueries(queryNames: string[]) {
  selectedQueries = new Set(queryNames);
  writeSelectedQueriesToStorage(selectedQueries);
  if (selectedQueries.size === 0) {
    flushPendingWithOriginalData();
  } else {
    // Resolve and drop queued requests for deselected queries.
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const request = queue[index];
      if (selectedQueries.has(request.queryName)) continue;
      request.resolve(request.originalData);
      queue.splice(index, 1);
    }

    if (activeRequest && !selectedQueries.has(activeRequest.queryName)) {
      activeRequest.resolve(activeRequest.originalData);
      activeRequest = null;
      activeSnapshot = null;
      activateNext();
    }
  }

  emitChange();
}

export function useActiveInterception() {
  return useSyncExternalStore(subscribe, currentSnapshot, currentSnapshot);
}

export async function interceptSdkDataIfEnabled(
  queryName: string,
  data: unknown
): Promise<unknown> {
  if (!selectedQueries.has(queryName)) return data;

  return new Promise((resolve, reject) => {
    queue.push({
      id: nextId++,
      queryName,
      originalData: data,
      initialText: toEditableText(data),
      resolve,
      reject,
    });
    activateNext();
    emitChange();
  });
}

export function submitActiveInterception(editedText: string): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  if (!activeRequest) {
    return { ok: false, error: "No active interception request." };
  }

  try {
    const parsedData = parseEditedText(editedText);
    activeRequest.resolve(parsedData);
    clearActiveAndAdvance();
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse JSON.";
    return { ok: false, error: message };
  }
}

export function throwActiveInterceptionError() {
  if (!activeRequest) return;
  activeRequest.reject(new Error("interceptor simulated error"));
  clearActiveAndAdvance();
}

export function stopInterceptingCurrentQuery() {
  if (!activeRequest) return;
  setQueryIntercepted(activeRequest.queryName, false);
}

export function stopInterceptingAllQueries() {
  setInterceptedQueries([]);
}
