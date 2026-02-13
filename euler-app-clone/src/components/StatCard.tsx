interface StatCardProps {
  label: string;
  value: string;
  className?: string;
}

export function StatCard({ label, value, className = "" }: StatCardProps) {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  );
}
