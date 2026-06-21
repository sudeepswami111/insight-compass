import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  ReferenceDot,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  analyzeDataset,
  formatNumber,
  formatPct,
  type AnalysisResult,
} from "@/lib/insightforge/analyze";
import type { ColumnSchema, DataRow } from "@/lib/insightforge/types";
import { supabase } from "@/integrations/supabase/client";
import { generateNarrative } from "@/lib/insightforge/narrative.functions";

interface Props {
  datasetId: string;
  rows: DataRow[];
  schema: ColumnSchema[];
  dateColumn: string | null;
  targetColumn: string | null;
}

export function AnalysisDashboard({
  datasetId,
  rows,
  schema,
  dateColumn,
  targetColumn,
}: Props) {
  const result = useMemo(
    () => analyzeDataset(rows, schema, { dateColumn, targetColumn }),
    [rows, schema, dateColumn, targetColumn],
  );

  return (
    <div className="space-y-6">
      <NarrativeCard datasetId={datasetId} result={result} />
      <HeadlineStats result={result} />
      <TrendsSection result={result} />
      <SegmentsSection result={result} />
      <CorrelationSection result={result} />
    </div>
  );
}

function NarrativeCard({ datasetId, result }: { datasetId: string; result: AnalysisResult }) {
  const qc = useQueryClient();
  const callNarrative = useServerFn(generateNarrative);

  const { data: existing } = useQuery({
    queryKey: ["narrative", datasetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analyses")
        .select("narrative, created_at")
        .eq("dataset_id", datasetId)
        .eq("kind", "narrative")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const gen = useMutation({
    mutationFn: async () => {
      // strip rows from the stats — narrative only needs the summary
      const compact = {
        rowCount: result.rowCount,
        columnCount: result.columnCount,
        dateColumn: result.dateColumn,
        targetColumn: result.targetColumn,
        numericColumns: result.numericColumns,
        categoricalColumns: result.categoricalColumns,
        descriptive: result.descriptive.slice(0, 6),
        trends: result.trends.map((t) => ({
          metric: t.metric,
          granularity: t.granularity,
          deltaPct: t.deltaPct,
          totalCurrent: t.totalCurrent,
          anomalyCount: t.anomalies.length,
          firstBucket: t.points[0]?.bucket,
          lastBucket: t.points[t.points.length - 1]?.bucket,
        })),
        segments: result.segments.map((s) => ({
          dimension: s.dimension,
          metric: s.metric,
          top: s.rows.slice(0, 3),
        })),
        correlation: result.correlation
          ? { topPairs: result.correlation.topPairs }
          : null,
        targetSummary: result.targetSummary,
      };
      return callNarrative({
        data: { datasetId, statsJson: JSON.stringify(compact) },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["narrative", datasetId] });
      toast.success("Narrative generated.");
    },
    onError: (e) =>
      toast.error("Couldn't generate narrative", {
        description: e instanceof Error ? e.message : "Unknown",
      }),
  });

  const text = existing?.narrative;

  return (
    <Card className="border-analysis/30 bg-analysis/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-analysis" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-analysis">
            Plain-language summary
          </h2>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => gen.mutate()}
          disabled={gen.isPending}
        >
          {gen.isPending ? "Writing…" : text ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {text ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {text}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Click <span className="font-medium">Generate</span> to have the AI describe
          the key numbers it sees in this dataset. The model is constrained to the
          computed stats — it can only describe numbers we just calculated.
        </p>
      )}
    </Card>
  );
}

function HeadlineStats({ result }: { result: AnalysisResult }) {
  const stats = result.descriptive.slice(0, 4);
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-tight">
        Headline metrics
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Descriptive statistics for your most variable numeric columns.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">
            No numeric columns detected.
          </Card>
        )}
        {stats.map((s) => (
          <Card key={s.column} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {s.column}
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums">
              {formatNumber(s.mean, { compact: true })}
            </p>
            <p className="text-[11px] text-muted-foreground">mean</p>
            <div className="mt-3 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
              <Stat label="min" v={s.min} />
              <Stat label="median" v={s.median} />
              <Stat label="max" v={s.max} />
            </div>
          </Card>
        ))}
      </div>
      {result.targetSummary && (
        <Card className="mt-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Target column
              </p>
              <p className="mt-1 text-sm font-medium">
                {result.targetSummary.column}{" "}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({result.targetSummary.kind})
                </span>
              </p>
            </div>
            {result.targetSummary.positiveRate !== undefined && (
              <Badge variant="outline" className="font-mono">
                positive rate {(result.targetSummary.positiveRate * 100).toFixed(1)}%
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Distribution: {result.targetSummary.distribution
              .slice(0, 5)
              .map((d) =>
                result.targetSummary?.kind === "numeric"
                  ? `${d.name}=${formatNumber(d.count, { compact: true })}`
                  : `${d.name} (${(d.pct * 100).toFixed(0)}%)`,
              )
              .join(" · ")}
          </p>
        </Card>
      )}
    </section>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <p className="font-mono tabular-nums text-foreground/80">
        {formatNumber(v, { compact: true })}
      </p>
      <p>{label}</p>
    </div>
  );
}

function TrendsSection({ result }: { result: AnalysisResult }) {
  if (!result.dateColumn) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Mark a date column on the project page to unlock trend charts.
      </Card>
    );
  }
  if (result.trends.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Date column found, but no numeric metric had enough data points to chart a
        trend.
      </Card>
    );
  }
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-tight">
        Trends over time
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Aggregated by {result.trends[0].granularity}. The dashed line is a rolling
        mean; dots flag anomalies (|z| ≥ 2.5).
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {result.trends.map((t) => (
          <TrendCard key={t.metric} t={t} />
        ))}
      </div>
    </section>
  );
}

function TrendCard({ t }: { t: AnalysisResult["trends"][number] }) {
  const data = t.points.map((p, i) => ({
    bucket: p.bucket,
    value: p.value,
    rolling: t.rollingMean[i],
  }));
  const arrow = t.deltaPct >= 0 ? TrendingUp : TrendingDown;
  const Arrow = arrow;
  const deltaColor = t.deltaPct >= 0 ? "text-success" : "text-destructive";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">{t.metric}</p>
          <p className="text-[11px] text-muted-foreground">
            {data.length} {t.granularity} buckets · {t.points[0].bucket} →{" "}
            {t.points[t.points.length - 1].bucket}
          </p>
        </div>
        <div className={`flex items-center gap-1 text-xs ${deltaColor}`}>
          <Arrow className="h-3.5 w-3.5" />
          {formatPct(t.deltaPct)}
        </div>
      </div>
      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              hide={data.length > 30}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                fontSize: 12,
              }}
            />
            <Line
              dataKey="value"
              stroke="var(--color-analysis)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="rolling"
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
            />
            {t.anomalies.map((a) => (
              <ReferenceDot
                key={a.bucket}
                x={a.bucket}
                y={a.value}
                r={4}
                fill="var(--color-destructive)"
                stroke="var(--color-background)"
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t.metric} {t.deltaPct >= 0 ? "rose" : "fell"} {formatPct(Math.abs(t.deltaPct))} in
        the latest bucket vs the prior one. {t.anomalies.length > 0 && (
          <span className="text-destructive">
            <AlertTriangle className="ml-1 inline h-3 w-3" /> {t.anomalies.length}{" "}
            anomaly point{t.anomalies.length === 1 ? "" : "s"} flagged.
          </span>
        )}
      </p>
    </Card>
  );
}

function SegmentsSection({ result }: { result: AnalysisResult }) {
  if (result.segments.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-tight">Segments</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Each chart breaks down{" "}
        <span className="font-mono">{result.segments[0].metric}</span> by a
        categorical column, summed across rows.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {result.segments.map((s) => (
          <Card key={s.dimension} className="p-4">
            <p className="text-sm font-medium">
              {s.metric} by {s.dimension}
            </p>
            <div className="mt-3 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="segment"
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="metric" fill="var(--color-analysis)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Top segment:{" "}
              <span className="font-medium text-foreground">{s.rows[0].segment}</span>{" "}
              with {formatNumber(s.rows[0].metric, { compact: true })} across{" "}
              {s.rows[0].count} rows.
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function CorrelationSection({ result }: { result: AnalysisResult }) {
  const c = result.correlation;
  if (!c) return null;
  const [hover, setHover] = useState<{ a: string; b: string; r: number } | null>(null);
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-tight">
        Correlations
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Pearson correlation between numeric columns. Closer to ±1 means a stronger
        linear relationship. Correlation is not causation.
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="p-4">
          <div className="grid" style={{ gridTemplateColumns: `120px repeat(${c.columns.length}, minmax(36px, 1fr))` }}>
            <div />
            {c.columns.map((col) => (
              <div
                key={col}
                className="truncate px-1 text-[10px] uppercase tracking-wide text-muted-foreground"
                title={col}
              >
                {col}
              </div>
            ))}
            {c.columns.map((rowCol, i) => (
              <div key={rowCol} className="contents">
                <div
                  className="truncate py-1 pr-2 text-[10px] uppercase tracking-wide text-muted-foreground"
                  title={rowCol}
                >
                  {rowCol}
                </div>
                {c.columns.map((colCol, j) => {
                  const r = c.matrix[i][j];
                  const bg = correlationColor(r);
                  return (
                    <div
                      key={colCol}
                      onMouseEnter={() => setHover({ a: rowCol, b: colCol, r })}
                      onMouseLeave={() => setHover(null)}
                      className="aspect-square cursor-default rounded-sm border border-border/40 text-center font-mono text-[10px] tabular-nums leading-[1.5]"
                      style={{ background: bg, color: Math.abs(r) > 0.5 ? "#0a0a0a" : "var(--color-foreground)" }}
                      title={`${rowCol} × ${colCol}: ${r.toFixed(2)}`}
                    >
                      {r.toFixed(1)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {hover && (
            <p className="mt-3 text-xs text-muted-foreground">
              {hover.a} × {hover.b}: <span className="font-mono">{hover.r.toFixed(3)}</span>
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Strongest pairs
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {c.topPairs.map((p) => (
              <li key={`${p.a}-${p.b}`} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {p.a} <span className="text-muted-foreground">×</span> {p.b}
                </span>
                <span
                  className={`font-mono text-xs ${
                    Math.abs(p.r) > 0.5 ? "text-analysis" : "text-muted-foreground"
                  }`}
                >
                  {p.r.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}

function correlationColor(r: number): string {
  // r in [-1, 1] → analysis teal for positive, destructive red for negative
  const a = Math.min(1, Math.abs(r));
  if (r >= 0) {
    return `oklch(0.78 0.13 200 / ${a.toFixed(2)})`;
  }
  return `oklch(0.6 0.22 25 / ${a.toFixed(2)})`;
}