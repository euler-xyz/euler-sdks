import type { PlanProgress } from "../utils/txProgress.ts";

type ExecutionProgressProps = {
  progress: PlanProgress;
  label?: string;
};

export function ExecutionProgress({ progress, label = "Execution" }: ExecutionProgressProps) {
  const total = Math.max(progress.total, 1);
  const percent = Math.round((progress.completed / total) * 100);

  return (
    <div className="plan-progress" aria-live="polite">
      <div className="plan-progress-label">
        <span>{label}</span>
        <span>
          {progress.completed}/{progress.total}
        </span>
      </div>
      {progress.status && <div className="plan-progress-status">{progress.status}</div>}
      <div className="plan-progress-bar">
        <div className="plan-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
