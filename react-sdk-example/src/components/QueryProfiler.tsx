import { useEffect, useState } from "react";
import { useQueryProfile } from "../queries/queryProfileStore.ts";

const STORAGE_KEY = "query-profiler-collapsed";

export function QueryProfiler() {
  const rows = useQueryProfile();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setCollapsed(stored === "1");
  }, []);

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className={`profiler-panel ${collapsed ? "collapsed" : ""}`}>
      <div className="profiler-header">
        {!collapsed && <div className="profiler-title">Query Profiler</div>}
        <button
          type="button"
          className="profiler-toggle"
          onClick={handleToggle}
          title={collapsed ? "Show Query Profiler" : "Hide Query Profiler"}
        >
          {collapsed ? "<" : "Hide"}
        </button>
      </div>
      {!collapsed &&
        (rows.length === 0 ? (
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
        ))}
    </div>
  );
}
