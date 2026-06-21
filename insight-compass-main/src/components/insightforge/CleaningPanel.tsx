import { useMemo, useState } from "react";
import type { QualityIssue } from "@/lib/insightforge/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

interface CleaningPanelProps {
  issues: QualityIssue[];
  onApply: (selected: QualityIssue[]) => void;
  applying?: boolean;
}

const SEVERITY_STYLE: Record<QualityIssue["severity"], string> = {
  high: "border-destructive/40 bg-destructive/5",
  medium: "border-warning/40 bg-warning/5",
  low: "border-border/60 bg-card",
};

export function CleaningPanel({ issues, onApply, applying }: CleaningPanelProps) {
  const actionable = useMemo(
    () => issues.filter((i) => i.action.type !== "none"),
    [issues],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(actionable.filter((i) => i.severity !== "low").map((i) => i.id)),
  );

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (issues.length === 0) {
    return (
      <Card className="flex items-center gap-3 border-success/40 bg-success/5 p-4">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <div>
          <p className="text-sm font-medium">No data quality issues found.</p>
          <p className="text-xs text-muted-foreground">
            Your dataset is ready for analysis.
          </p>
        </div>
      </Card>
    );
  }

  const selectedIssues = issues.filter((i) => selected.has(i.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-warning" />
          {issues.length} issue{issues.length === 1 ? "" : "s"} detected —
          review before applying.
        </div>
        <Button
          size="sm"
          onClick={() => onApply(selectedIssues)}
          disabled={applying || selectedIssues.length === 0}
        >
          <Sparkles className="h-4 w-4" />
          Apply {selectedIssues.length} fix
          {selectedIssues.length === 1 ? "" : "es"}
        </Button>
      </div>
      <div className="space-y-2">
        {issues.map((issue) => {
          const disabled = issue.action.type === "none";
          return (
            <label
              key={issue.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${SEVERITY_STYLE[issue.severity]} ${disabled ? "cursor-default opacity-70" : ""}`}
            >
              <Checkbox
                checked={selected.has(issue.id)}
                onCheckedChange={() => !disabled && toggle(issue.id)}
                disabled={disabled}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{issue.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {issue.suggestion}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  issue.severity === "high"
                    ? "bg-destructive/20 text-destructive"
                    : issue.severity === "medium"
                      ? "bg-warning/20 text-warning"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {issue.severity}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}