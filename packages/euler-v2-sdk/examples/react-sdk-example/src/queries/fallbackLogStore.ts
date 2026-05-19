import { useSyncExternalStore } from "react";
import type { FallbackInfo, FallbackTrigger } from "@eulerxyz/euler-v2-sdk";

export interface FallbackLogEntry {
  id: number;
  timestamp: number;
  method: string;
  primaryName: string;
  secondaryName: string;
  argsPreview: string;
  trigger: FallbackTrigger;
  primaryError?: string;
  primaryIssueCount: number;
  primaryIssueCodes: string[];
  missingIndices?: number[];
}

const MAX_ENTRIES = 200;

let nextId = 1;
let entries: FallbackLogEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return entries;
}

function safeStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "function") return "[Function]";
  if (typeof value !== "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  try {
    return JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? `${v.toString()}n` : v,
    );
  } catch {
    return "[Unserializable]";
  }
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return "()";
  const parts = args.map((arg) => {
    const s = safeStringify(arg);
    return s.length > 120 ? `${s.slice(0, 117)}...` : s;
  });
  return `(${parts.join(", ")})`;
}

export function recordFallback(info: FallbackInfo): void {
  const entry: FallbackLogEntry = {
    id: nextId++,
    timestamp: Date.now(),
    method: info.method,
    primaryName: info.primaryName,
    secondaryName: info.secondaryName,
    argsPreview: formatArgs(info.args),
    trigger: info.trigger,
    primaryError:
      info.primaryError instanceof Error
        ? info.primaryError.message
        : info.primaryError !== undefined
          ? String(info.primaryError)
          : undefined,
    primaryIssueCount: info.primaryIssues?.length ?? 0,
    primaryIssueCodes: Array.from(
      new Set((info.primaryIssues ?? []).map((issue) => issue.code ?? "UNKNOWN")),
    ),
    missingIndices: info.missingIndices,
  };

  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
}

export function clearFallbackLog(): void {
  if (entries.length === 0) return;
  entries = [];
  emit();
}

export function useFallbackLog() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
