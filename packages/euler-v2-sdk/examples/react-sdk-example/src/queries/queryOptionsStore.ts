import type { NetworkMode } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  ALL_CHAIN_IDS,
  DEFAULT_ENABLED_CHAIN_IDS,
} from "../config/chains.ts";

const STORAGE_KEY = "sdk-query-profiler-react-query-options";
export const QUERY_OPTIONS_CHAIN_SET_VERSION = 3;
const CHAIN_SET_VERSION = QUERY_OPTIONS_CHAIN_SET_VERSION;
const LEGACY_DEFAULT_ENABLED_CHAIN_IDS = [1, 143, 146, 8453, 42161];

export type RetryStrategy =
  | "inherit"
  | "off"
  | "once"
  | "count"
  | "always";

export type SdkAdapterMode = "v3" | "onchain";

export interface QueryOptionsSettings {
  chainSetVersion: number;
  adapterMode: SdkAdapterMode;
  proxyV3Calls: boolean;
  enabledChainIds: number[];
  showQueryProfiler: boolean;
  disableCache: boolean;
  staleTimeMs: number | null;
  gcTimeMs: number | null;
  retryStrategy: RetryStrategy;
  retryCount: number;
  retryDelayMs: number | null;
  networkMode: "inherit" | NetworkMode;
  advancedOptionsText: string;
}

export interface QueryBuildOverrides {
  disableCache: boolean;
  fetchQueryOptions: Record<string, unknown>;
}

const DEFAULT_SETTINGS: QueryOptionsSettings = {
  chainSetVersion: CHAIN_SET_VERSION,
  adapterMode: "v3",
  proxyV3Calls: true,
  enabledChainIds: DEFAULT_ENABLED_CHAIN_IDS,
  showQueryProfiler: true,
  disableCache: false,
  staleTimeMs: null,
  gcTimeMs: null,
  retryStrategy: "inherit",
  retryCount: 2,
  retryDelayMs: null,
  networkMode: "inherit",
  advancedOptionsText: "",
};

const listeners = new Set<() => void>();
let currentSettings = readFromStorage();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readFromStorage(): QueryOptionsSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeToStorage(value: QueryOptionsSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function sanitizeEnabledChainIds(value: unknown): number[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.enabledChainIds;

  const allowed = new Set(ALL_CHAIN_IDS);
  const selected = Array.from(
    new Set(
      value.filter(
        (candidate): candidate is number =>
          typeof candidate === "number" &&
          Number.isInteger(candidate) &&
          allowed.has(candidate)
      )
    )
  ).sort((a, b) => a - b);

  return selected.length > 0 ? selected : DEFAULT_SETTINGS.enabledChainIds;
}

function matchesChainIds(value: number[], expected: number[]) {
  return (
    value.length === expected.length &&
    value.every((chainId, index) => chainId === expected[index])
  );
}

function sanitizeSettings(value: unknown): QueryOptionsSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;

  const candidate = value as Partial<QueryOptionsSettings>;
  const retryStrategy: RetryStrategy =
    candidate.retryStrategy === "off" ||
    candidate.retryStrategy === "once" ||
    candidate.retryStrategy === "count" ||
    candidate.retryStrategy === "always" ||
    candidate.retryStrategy === "inherit"
      ? candidate.retryStrategy
      : DEFAULT_SETTINGS.retryStrategy;

  const networkMode =
    candidate.networkMode === "online" ||
    candidate.networkMode === "always" ||
    candidate.networkMode === "offlineFirst" ||
    candidate.networkMode === "inherit"
      ? candidate.networkMode
      : DEFAULT_SETTINGS.networkMode;

  const sanitized = {
    chainSetVersion: CHAIN_SET_VERSION,
    adapterMode:
      candidate.adapterMode === "onchain" || candidate.adapterMode === "v3"
        ? candidate.adapterMode
        : DEFAULT_SETTINGS.adapterMode,
    proxyV3Calls:
      typeof candidate.proxyV3Calls === "boolean"
        ? candidate.proxyV3Calls
        : DEFAULT_SETTINGS.proxyV3Calls,
    enabledChainIds: sanitizeEnabledChainIds(candidate.enabledChainIds),
    showQueryProfiler:
      typeof candidate.showQueryProfiler === "boolean"
        ? candidate.showQueryProfiler
        : DEFAULT_SETTINGS.showQueryProfiler,
    disableCache: candidate.disableCache === true,
    staleTimeMs: asFiniteNumber(candidate.staleTimeMs),
    gcTimeMs: asFiniteNumber(candidate.gcTimeMs),
    retryStrategy,
    retryCount:
      typeof candidate.retryCount === "number" &&
      Number.isFinite(candidate.retryCount) &&
      candidate.retryCount >= 0
        ? Math.floor(candidate.retryCount)
        : DEFAULT_SETTINGS.retryCount,
    retryDelayMs: asFiniteNumber(candidate.retryDelayMs),
    networkMode,
    advancedOptionsText:
      typeof candidate.advancedOptionsText === "string"
        ? candidate.advancedOptionsText
        : DEFAULT_SETTINGS.advancedOptionsText,
  };

  if (
    candidate.chainSetVersion !== CHAIN_SET_VERSION ||
    matchesChainIds(sanitized.enabledChainIds, LEGACY_DEFAULT_ENABLED_CHAIN_IDS)
  ) {
    sanitized.enabledChainIds = DEFAULT_SETTINGS.enabledChainIds;
  }

  return sanitized;
}

function parseAdvancedOptions(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid JSON value.";
    throw new Error(`Advanced options must be valid JSON. ${message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Advanced options must be a JSON object.");
  }

  const result = { ...(parsed as Record<string, unknown>) };
  delete result.queryKey;
  delete result.queryFn;
  return result;
}

function currentSnapshot() {
  return currentSettings;
}

export function useQueryOptionsSettings() {
  return useSyncExternalStore(subscribe, currentSnapshot, currentSnapshot);
}

function currentAdapterModeSnapshot() {
  return currentSettings.adapterMode;
}

export function useSdkAdapterMode() {
  return useSyncExternalStore(
    subscribe,
    currentAdapterModeSnapshot,
    currentAdapterModeSnapshot
  );
}

function currentProxyV3CallsSnapshot() {
  return currentSettings.proxyV3Calls;
}

export function useProxyV3Calls() {
  return useSyncExternalStore(
    subscribe,
    currentProxyV3CallsSnapshot,
    currentProxyV3CallsSnapshot
  );
}

function currentEnabledChainIdsSnapshot() {
  return currentSettings.enabledChainIds;
}

export function useEnabledChainIds() {
  return useSyncExternalStore(
    subscribe,
    currentEnabledChainIdsSnapshot,
    currentEnabledChainIdsSnapshot
  );
}

function currentShowQueryProfilerSnapshot() {
  return currentSettings.showQueryProfiler;
}

export function useShowQueryProfiler() {
  return useSyncExternalStore(
    subscribe,
    currentShowQueryProfilerSnapshot,
    currentShowQueryProfilerSnapshot
  );
}

export function getQueryOptionsSettings() {
  return currentSettings;
}

export function setQueryOptionsSettings(next: QueryOptionsSettings) {
  parseAdvancedOptions(next.advancedOptionsText);
  currentSettings = sanitizeSettings(next);
  writeToStorage(currentSettings);
  emitChange();
}

export function resetQueryOptionsSettings() {
  currentSettings = DEFAULT_SETTINGS;
  writeToStorage(currentSettings);
  emitChange();
}

export function hasActiveQueryOptionsOverrides(
  settings: QueryOptionsSettings
): boolean {
  return (
    settings.adapterMode !== DEFAULT_SETTINGS.adapterMode ||
    settings.proxyV3Calls !== DEFAULT_SETTINGS.proxyV3Calls ||
    settings.enabledChainIds.length !== DEFAULT_SETTINGS.enabledChainIds.length ||
    settings.enabledChainIds.some(
      (chainId, index) => chainId !== DEFAULT_SETTINGS.enabledChainIds[index]
    ) ||
    settings.showQueryProfiler !== DEFAULT_SETTINGS.showQueryProfiler ||
    settings.disableCache ||
    settings.staleTimeMs !== null ||
    settings.gcTimeMs !== null ||
    settings.retryStrategy !== DEFAULT_SETTINGS.retryStrategy ||
    settings.retryCount !== DEFAULT_SETTINGS.retryCount ||
    settings.retryDelayMs !== null ||
    settings.networkMode !== DEFAULT_SETTINGS.networkMode ||
    settings.advancedOptionsText.trim().length > 0
  );
}

export function getQueryBuildOverrides(): QueryBuildOverrides {
  const settings = getQueryOptionsSettings();
  const fetchQueryOptions = parseAdvancedOptions(settings.advancedOptionsText);

  if (settings.staleTimeMs !== null) {
    fetchQueryOptions.staleTime = settings.staleTimeMs;
  }

  if (settings.gcTimeMs !== null) {
    fetchQueryOptions.gcTime = settings.gcTimeMs;
  }

  if (settings.retryStrategy === "off") {
    fetchQueryOptions.retry = false;
  } else if (settings.retryStrategy === "once") {
    fetchQueryOptions.retry = 1;
  } else if (settings.retryStrategy === "count") {
    fetchQueryOptions.retry = settings.retryCount;
  } else if (settings.retryStrategy === "always") {
    fetchQueryOptions.retry = true;
  }

  if (settings.retryDelayMs !== null) {
    fetchQueryOptions.retryDelay = settings.retryDelayMs;
  }

  if (settings.networkMode !== "inherit") {
    fetchQueryOptions.networkMode = settings.networkMode;
  }

  return {
    disableCache: settings.disableCache,
    fetchQueryOptions,
  };
}
