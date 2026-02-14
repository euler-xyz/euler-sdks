import { useQueryProfile } from "../queries/queryProfileStore.ts";

export function QueryProfiler() {
  const rows = useQueryProfile();

  return (
    <div className="profiler-panel">
      <div className="profiler-title">Query Profiler</div>
      {rows.length === 0 ? (
        <div className="profiler-empty">No recent queries</div>
      ) : (
        <div className="profiler-rows">
          {rows.map((row) => (
            <div
              key={row.queryName}
              className={`profiler-row ${row.state === "fading" ? "fading" : ""}`}
            >
              <span className="profiler-count">{row.count}x</span>
              <span className="profiler-name">{row.queryName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
