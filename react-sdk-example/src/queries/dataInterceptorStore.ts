import { useSyncExternalStore } from "react";

const STORAGE_KEY = "sdk-data-interceptor-enabled";
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

let enabled = readEnabledFromStorage();
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

function readEnabledFromStorage() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function writeEnabledToStorage(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
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

export function useDataInterceptorEnabled() {
  return useSyncExternalStore(subscribe, () => enabled, () => enabled);
}

export function setDataInterceptorEnabled(value: boolean) {
  enabled = value;
  writeEnabledToStorage(value);
  if (!value) {
    flushPendingWithOriginalData();
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
  if (!enabled) return data;

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

export function continueAndDisableInterceptor() {
  setDataInterceptorEnabled(false);
}
