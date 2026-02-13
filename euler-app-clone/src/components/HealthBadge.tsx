import type { DaysToLiquidation } from "euler-v2-sdk";

interface HealthBadgeProps {
  daysToLiquidation: DaysToLiquidation;
}

export function HealthBadge({ daysToLiquidation }: HealthBadgeProps) {
  if (daysToLiquidation === "Infinity") {
    return <span className="badge badge-success">Safe</span>;
  }
  if (daysToLiquidation === "MoreThanAYear") {
    return <span className="badge badge-success">&gt;1 year</span>;
  }

  const days = daysToLiquidation;
  if (days > 365) {
    return <span className="badge badge-success">&gt;1 year</span>;
  }
  if (days > 30) {
    return <span className="badge badge-warning">{days}d</span>;
  }
  return <span className="badge badge-danger">{days}d</span>;
}
