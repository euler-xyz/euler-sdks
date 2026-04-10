import { useEffect, useState } from "react";
import { ALL_CHAIN_IDS, CHAIN_NAMES } from "../config/chains.ts";
import {
  getQueryOptionsSettings,
  hasActiveQueryOptionsOverrides,
  resetQueryOptionsSettings,
  setQueryOptionsSettings,
  type SdkAdapterMode,
  type QueryOptionsSettings,
  useQueryOptionsSettings,
} from "../queries/queryOptionsStore.ts";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FormState = {
  adapterMode: SdkAdapterMode;
  enabledChainIds: number[];
  showQueryProfiler: boolean;
  disableCache: boolean;
  staleTimeMs: string;
  gcTimeMs: string;
  retryStrategy: QueryOptionsSettings["retryStrategy"];
  retryCount: string;
  retryDelayMs: string;
  networkMode: QueryOptionsSettings["networkMode"];
  advancedOptionsText: string;
};

function toFormState(settings: QueryOptionsSettings): FormState {
  return {
    adapterMode: settings.adapterMode,
    enabledChainIds: settings.enabledChainIds,
    showQueryProfiler: settings.showQueryProfiler,
    disableCache: settings.disableCache,
    staleTimeMs: settings.staleTimeMs === null ? "" : String(settings.staleTimeMs),
    gcTimeMs: settings.gcTimeMs === null ? "" : String(settings.gcTimeMs),
    retryStrategy: settings.retryStrategy,
    retryCount: String(settings.retryCount),
    retryDelayMs:
      settings.retryDelayMs === null ? "" : String(settings.retryDelayMs),
    networkMode: settings.networkMode,
    advancedOptionsText: settings.advancedOptionsText,
  };
}

function parseOptionalNumber(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function toSettings(form: FormState): QueryOptionsSettings {
  const retryCount = Number(form.retryCount.trim());
  if (
    !Number.isFinite(retryCount) ||
    retryCount < 0 ||
    !Number.isInteger(retryCount)
  ) {
    throw new Error("Retry count must be a non-negative integer.");
  }

  return {
    adapterMode: form.adapterMode,
    enabledChainIds: [...form.enabledChainIds].sort((a, b) => a - b),
    showQueryProfiler: form.showQueryProfiler,
    disableCache: form.disableCache,
    staleTimeMs: parseOptionalNumber(form.staleTimeMs, "Stale time"),
    gcTimeMs: parseOptionalNumber(form.gcTimeMs, "GC time"),
    retryStrategy: form.retryStrategy,
    retryCount,
    retryDelayMs: parseOptionalNumber(form.retryDelayMs, "Retry delay"),
    networkMode: form.networkMode,
    advancedOptionsText: form.advancedOptionsText,
  };
}

export function QueryOptionsModal({ open, onClose }: Props) {
  const settings = useQueryOptionsSettings();
  const [form, setForm] = useState<FormState>(() => toFormState(settings));
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "react-query">(
    "general"
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setForm(toFormState(getQueryOptionsSettings()));
      setError(null);
      setActiveTab("general");
    });

    return () => {
      cancelled = true;
    };
  }, [open, settings]);

  if (!open) return null;

  return (
    <div className="interceptor-overlay" role="dialog" aria-modal="true">
      <div className="query-options-modal">
        <h2>SDK Tools</h2>
        <div className="query-options-tabs" role="tablist" aria-label="Options sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "general"}
            className={`query-options-tab ${
              activeTab === "general" ? "active" : ""
            }`}
            onClick={() => setActiveTab("general")}
          >
            General
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "react-query"}
            className={`query-options-tab ${
              activeTab === "react-query" ? "active" : ""
            }`}
            onClick={() => setActiveTab("react-query")}
          >
            React Query
          </button>
        </div>

        {activeTab === "general" ? (
          <>
            <div className="query-options-summary">
              General SDK settings for the example app. Adapter mode applies to
              the built-in account, EVault, and EulerEarn services.
            </div>

            <div className="query-options-grid query-options-grid-single">
              <label className="query-options-toggle-card">
                <span className="query-options-toggle-copy">
                  <span className="query-options-toggle-title">
                    Show Query Profiler
                  </span>
                  <span className="query-options-toggle-description">
                    Show or hide the right-side query profiler panel.
                  </span>
                </span>
                <span className="query-options-switch">
                  <input
                    type="checkbox"
                    checked={form.showQueryProfiler}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        showQueryProfiler: event.target.checked,
                      }))
                    }
                  />
                  <span className="query-options-switch-track">
                    <span className="query-options-switch-thumb" />
                  </span>
                </span>
              </label>

              <label className="query-options-toggle-card">
                <span className="query-options-toggle-copy">
                  <span className="query-options-toggle-title">
                    Use V3 adapters
                  </span>
                  <span className="query-options-toggle-description">
                    On enables V3 HTTP adapters. Off rebuilds the SDK with
                    onchain adapters where available.
                  </span>
                </span>
                <span className="query-options-switch">
                  <input
                    type="checkbox"
                    checked={form.adapterMode === "v3"}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        adapterMode: event.target.checked ? "v3" : "onchain",
                      }))
                    }
                  />
                  <span className="query-options-switch-track">
                    <span className="query-options-switch-thumb" />
                  </span>
                </span>
              </label>

              <div className="query-options-field" style={{ gridColumn: "1 / -1" }}>
                <span>Enabled chains for all-chain vault queries</span>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 12,
                    marginTop: 12,
                  }}
                >
                  {ALL_CHAIN_IDS.map((chainId) => {
                    const checked = form.enabledChainIds.includes(chainId);
                    const disableUncheck =
                      checked && form.enabledChainIds.length === 1;
                    return (
                      <label key={chainId} className="query-options-checkbox">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disableUncheck}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              enabledChainIds: event.target.checked
                                ? [...prev.enabledChainIds, chainId].sort((a, b) => a - b)
                                : prev.enabledChainIds.filter((id) => id !== chainId),
                            }))
                          }
                        />
                        <span>{CHAIN_NAMES[chainId] ?? `Chain ${chainId}`}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="query-options-summary" style={{ marginTop: 12 }}>
                  Applies to the app&apos;s all-chain EVault and Euler Earn lists.
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="query-options-summary">
              These overrides are applied to every `queryClient.fetchQuery()`
              call created by `sdkBuildQuery`. Function-valued React Query
              options are not supported in this form.
            </div>

            <div className="query-options-grid">
              <label className="query-options-checkbox">
                <input
                  type="checkbox"
                  checked={form.disableCache}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, disableCache: event.target.checked }))
                  }
                />
                <span>Disable cache after each fetch</span>
              </label>

              <label className="query-options-field">
                <span>Stale time (ms)</span>
                <input
                  className="filter-input"
                  value={form.staleTimeMs}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, staleTimeMs: event.target.value }))
                  }
                  placeholder="leave blank to keep per-query defaults"
                />
              </label>

              <label className="query-options-field">
                <span>GC time (ms)</span>
                <input
                  className="filter-input"
                  value={form.gcTimeMs}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, gcTimeMs: event.target.value }))
                  }
                  placeholder="leave blank to inherit"
                />
              </label>

              <label className="query-options-field">
                <span>Retry strategy</span>
                <select
                  className="filter-select"
                  value={form.retryStrategy}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      retryStrategy: event.target.value as FormState["retryStrategy"],
                    }))
                  }
                >
                  <option value="inherit">inherit app default</option>
                  <option value="off">disable retries</option>
                  <option value="once">retry once</option>
                  <option value="count">retry N times</option>
                  <option value="always">always retry</option>
                </select>
              </label>

              <label className="query-options-field">
                <span>Retry count</span>
                <input
                  className="filter-input"
                  value={form.retryCount}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, retryCount: event.target.value }))
                  }
                  disabled={form.retryStrategy !== "count"}
                />
              </label>

              <label className="query-options-field">
                <span>Retry delay (ms)</span>
                <input
                  className="filter-input"
                  value={form.retryDelayMs}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, retryDelayMs: event.target.value }))
                  }
                  placeholder="leave blank to inherit"
                />
              </label>

              <label className="query-options-field">
                <span>Network mode</span>
                <select
                  className="filter-select"
                  value={form.networkMode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      networkMode: event.target.value as FormState["networkMode"],
                    }))
                  }
                >
                  <option value="inherit">inherit app default</option>
                  <option value="online">online</option>
                  <option value="always">always</option>
                  <option value="offlineFirst">offlineFirst</option>
                </select>
              </label>
            </div>

            <label className="query-options-field">
              <span>Advanced fetchQuery options (JSON object)</span>
              <textarea
                className="interceptor-textarea query-options-textarea"
                value={form.advancedOptionsText}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    advancedOptionsText: event.target.value,
                  }))
                }
                placeholder={`{\n  "meta": { "source": "profiler" }\n}`}
              />
            </label>
          </>
        )}

        {error ? <div className="interceptor-error">{error}</div> : null}

        <div className="query-options-actions">
          <button
            className="wallet-button"
            onClick={() => {
              try {
                setQueryOptionsSettings(toSettings(form));
                onClose();
              } catch (nextError) {
                setError(
                  nextError instanceof Error
                    ? nextError.message
                    : "Failed to save query options."
                );
              }
            }}
          >
            Apply
          </button>
          <button
            className="wallet-button"
            onClick={() => {
              resetQueryOptionsSettings();
              setForm(toFormState(getQueryOptionsSettings()));
              setError(null);
            }}
            disabled={!hasActiveQueryOptionsOverrides(settings)}
          >
            Reset
          </button>
          <button className="wallet-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
