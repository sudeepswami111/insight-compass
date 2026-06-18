import type { QualityReport } from "@/lib/insightforge/types";

export function QualityScore({ report }: { report: QualityReport }) {
  const tier =
    report.score >= 85
      ? { label: "Excellent", color: "text-success" }
      : report.score >= 65
        ? { label: "Good", color: "text-analysis" }
        : report.score >= 40
          ? { label: "Needs cleaning", color: "text-warning" }
          : { label: "Poor", color: "text-destructive" };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Data Quality
        </p>
        <span className={`text-xs font-medium ${tier.color}`}>
          {tier.label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight">
          {report.score}
        </span>
        <span className="text-sm text-muted-foreground">/ 100</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-analysis transition-all"
          style={{ width: `${report.score}%` }}
        />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Rows" value={report.totalRows.toLocaleString()} />
        <Stat label="Duplicates" value={report.duplicateRows.toLocaleString()} />
        <Stat
          label="Missing"
          value={`${(report.missingCellsPct * 100).toFixed(1)}%`}
        />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}