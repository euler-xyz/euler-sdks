import { useEffect, useMemo, useRef } from "react";
import { useQueryProfile } from "../queries/queryProfileStore.ts";
import {
  setInterceptedQueries,
  setQueryIntercepted,
  useSelectedInterceptedQueries,
} from "../queries/dataInterceptorStore.ts";
import {
  getQueryOptionsSettings,
  setQueryOptionsSettings,
} from "../queries/queryOptionsStore.ts";

type QueryGroup =
  | "vaults"
  | "account"
  | "services"
  | "labels"
  | "deployments";

const GROUP_ORDER: QueryGroup[] = [
  "vaults",
  "account",
  "services",
  "labels",
  "deployments",
];

const GROUP_LABELS: Record<QueryGroup, string> = {
  vaults: "Vault Services",
  account: "Account",
  services: "Services",
  labels: "Labels",
  deployments: "Deployments",
};

function getQueryGroup(queryName: string): QueryGroup {
  if (queryName === "queryDeployments") return "deployments";

  if (
    queryName.startsWith("queryEulerLabels") ||
    queryName === "queryTokenList" ||
    queryName === "queryABI"
  ) {
    return "labels";
  }

  if (
    queryName.startsWith("queryEVault") ||
    queryName.startsWith("queryEulerEarn") ||
    queryName.startsWith("queryVaultFactories") ||
    queryName.startsWith("queryV3VaultResolve") ||
    queryName.startsWith("queryV3EVault") ||
    queryName.startsWith("queryV3EulerEarn") ||
    queryName.startsWith("queryVaultInfoERC4626") ||
    queryName.startsWith("querySecuritizeVault")
  ) {
    return "vaults";
  }

  if (
    queryName.startsWith("queryAccount") ||
    queryName.startsWith("queryV3Account") ||
    queryName.startsWith("queryEVCAccountInfo") ||
    queryName.startsWith("queryVaultAccountInfo")
  ) {
    return "account";
  }

  return "services";
}

export function QueryProfiler() {
  const rows = useQueryProfile();
  const selectedQueries = useSelectedInterceptedQueries();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selectedCount = useMemo(
    () => rows.filter((row) => selectedQueries.has(row.queryName)).length,
    [rows, selectedQueries]
  );
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const someSelected = selectedCount > 0 && selectedCount < rows.length;

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const groupedRows = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        label: GROUP_LABELS[group],
        rows: rows.filter((row) => getQueryGroup(row.queryName) === group),
      })).filter((section) => section.rows.length > 0),
    [rows]
  );

  return (
    <div className="profiler-panel">
      <div className="profiler-header">
        <div className="profiler-title">Query Profiler</div>
        <div className="profiler-actions">
          <button
            type="button"
            className="profiler-toggle"
            onClick={() =>
              setQueryOptionsSettings({
                ...getQueryOptionsSettings(),
                showQueryProfiler: false,
              })
            }
            title="Hide Query Profiler"
          >
            Hide
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="profiler-empty">No queries available</div>
      ) : (
        <div className="profiler-table">
          <div className="profiler-head-row">
            <span className="profiler-head-check">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={(event) => {
                  if (event.target.checked) {
                    setInterceptedQueries(rows.map((row) => row.queryName));
                  } else {
                    setInterceptedQueries([]);
                  }
                }}
                title={allSelected ? "Deselect all queries" : "Select all queries"}
              />
            </span>
            <span className="profiler-head-name">Query</span>
            <span className="profiler-head-count">Count</span>
          </div>
          {groupedRows.map((section) => (
            <div key={section.group} className="profiler-group">
              <div className="profiler-group-title">{section.label}</div>
              {section.rows.map((row) => (
                <div
                  key={row.queryName}
                  className="profiler-row"
                >
                  <span className="profiler-check">
                    <input
                      type="checkbox"
                      checked={selectedQueries.has(row.queryName)}
                      onChange={(event) =>
                        setQueryIntercepted(row.queryName, event.target.checked)
                      }
                      title={`Intercept ${row.queryName}`}
                    />
                  </span>
                  <span className="profiler-name">{row.queryName}</span>
                  <span className="profiler-counts">
                    <span
                      className={`profiler-count ${
                        row.successState === "fading" ? "fading" : ""
                      }`}
                    >
                      {row.successCount > 0 ? `${row.successCount}x` : ""}
                    </span>
                    <span
                      className={`profiler-count profiler-count-error ${
                        row.errorState === "fading" ? "fading" : ""
                      }`}
                    >
                      {row.errorCount > 0 ? `${row.errorCount}x` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
