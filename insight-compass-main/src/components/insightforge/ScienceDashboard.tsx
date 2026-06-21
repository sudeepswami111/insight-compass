import { useMemo, useState, useRef } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  Brain,
  Users,
  Sliders,
  Loader2,
  AlertTriangle,
  Award,
  Target,
} from "lucide-react";
import type { DataRow, ColumnSchema } from "@/lib/insightforge/types";
import { runForecast, type ForecastResult } from "@/lib/insightforge/ml/forecast";
import { runAutoML, whatIfPredict, type ModelResult } from "@/lib/insightforge/ml/automl";
import { runClustering, type KMeansResult } from "@/lib/insightforge/ml/kmeans";
import { prepareDataset } from "@/lib/insightforge/ml/regression";
import type { AnalysisResult } from "@/lib/insightforge/analyze";
import { formatNumber, formatPct } from "@/lib/insightforge/analyze";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { generateRecommendations } from "@/lib/insightforge/recommendations";

const CLUSTER_COLORS = [
  "var(--color-analysis)",
  "var(--color-forecast)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

type Tab = "forecast" | "predict" | "cluster" | "whatif" | "recs";

interface Props {
  rows: DataRow[];
  schema: ColumnSchema[];
  dateColumn: string | null;
  targetColumn: string | null;
  analysis: AnalysisResult;
  projectName: string;
  isAdvanced: boolean;
}

export function ScienceDashboard({
  rows,
  schema,
  dateColumn,
  targetColumn,
  analysis,
  projectName,
  isAdvanced,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("forecast");
  const [horizon, setHorizon] = useState<7 | 30 | 90>(30);

  // ── Run ML (memoized — expensive) ─────────────────────────────────────
  const forecast = useMemo<ForecastResult | null>(() => {
    if (!dateColumn || analysis.trends.length === 0) return null;
    const trend = analysis.trends[0];
    return runForecast(trend.points, trend.metric, horizon, trend.granularity);
  }, [analysis.trends, dateColumn, horizon]);

  const model = useMemo<ModelResult | null>(() => {
    if (!targetColumn) return null;
    try {
      return runAutoML(rows, schema, targetColumn);
    } catch {
      return null;
    }
  }, [rows, schema, targetColumn]);

  const clustering = useMemo<KMeansResult | null>(() => {
    const numCols = schema
      .filter((c) => (c.overrideType ?? c.inferredType) === "numeric")
      .map((c) => c.name)
      .slice(0, 6);
    if (numCols.length < 2 || rows.length < 6) return null;
    const X = rows.map((r) =>
      numCols.map((col) => {
        const v = r[col];
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
      }),
    );
    try {
      return runClustering(X, numCols);
    } catch {
      return null;
    }
  }, [rows, schema]);

  const recommendations = useMemo(
    () => generateRecommendations(analysis, model, forecast, clustering),
    [analysis, model, forecast, clustering],
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "forecast", label: "Forecast", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: "predict", label: "Predict", icon: <Brain className="h-3.5 w-3.5" /> },
    { id: "cluster", label: "Cluster", icon: <Users className="h-3.5 w-3.5" /> },
    { id: "whatif", label: "What-If", icon: <Sliders className="h-3.5 w-3.5" /> },
    { id: "recs", label: "Recommendations", icon: <Award className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border/60 bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === t.id
                ? "bg-forecast text-forecast-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "forecast" && (
        <ForecastTab forecast={forecast} dateColumn={dateColumn} horizon={horizon} onHorizonChange={setHorizon} />
      )}
      {activeTab === "predict" && (
        <PredictTab model={model} targetColumn={targetColumn} isAdvanced={isAdvanced} />
      )}
      {activeTab === "cluster" && (
        <ClusterTab clustering={clustering} schema={schema} />
      )}
      {activeTab === "whatif" && (
        <WhatIfTab model={model} rows={rows} schema={schema} targetColumn={targetColumn} />
      )}
      {activeTab === "recs" && (
        <RecommendationsPanel recommendations={recommendations} />
      )}
    </div>
  );
}

// ── Forecast Tab ───────────────────────────────────────────────────────────

function ForecastTab({
  forecast,
  dateColumn,
  horizon,
  onHorizonChange,
}: {
  forecast: ForecastResult | null;
  dateColumn: string | null;
  horizon: 7 | 30 | 90;
  onHorizonChange: (h: 7 | 30 | 90) => void;
}) {
  if (!dateColumn) {
    return (
      <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No date column" description="Mark a date column on the project page to enable time-series forecasting." />
    );
  }
  if (!forecast) {
    return <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="Not enough data" description="Need at least 4 historical data points to build a forecast." />;
  }

  const historyPoints = forecast.points.filter((p) => p.isHistory);
  const futurePoints = forecast.points.filter((p) => !p.isHistory);
  // Show only last 30 history points + all future for cleaner chart
  const chartData = [
    ...historyPoints.slice(-30).map((p) => ({
      bucket: p.bucket,
      actual: p.value,
      forecast: undefined as number | undefined,
      lower: undefined as number | undefined,
      upper: undefined as number | undefined,
    })),
    ...futurePoints.map((p) => ({
      bucket: p.bucket,
      actual: undefined as number | undefined,
      forecast: p.forecast,
      lower: p.lower,
      upper: p.upper,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            {forecast.metric} Forecast
          </h2>
          <p className="text-xs text-muted-foreground">{forecast.plainText}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Horizon:</span>
          {([7, 30, 90] as const).map((h) => (
            <button
              key={h}
              onClick={() => onHorizonChange(h)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                horizon === h ? "bg-forecast text-forecast-foreground" : "border border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {h}d
            </button>
          ))}
        </div>
      </div>

      <Card className="p-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                hide={chartData.length > 40}
              />
              <YAxis tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} width={40} />
              <Tooltip
                contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 11 }}
              />
              <Area
                dataKey="upper"
                stroke="none"
                fill="var(--color-forecast)"
                fillOpacity={0.15}
                dot={false}
                connectNulls
              />
              <Area
                dataKey="lower"
                stroke="none"
                fill="var(--color-background)"
                fillOpacity={1}
                dot={false}
                connectNulls
              />
              <Line
                dataKey="actual"
                stroke="var(--color-analysis)"
                strokeWidth={2}
                dot={false}
                connectNulls
                name="Actual"
              />
              <Line
                dataKey="forecast"
                stroke="var(--color-forecast)"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
                name="Forecast"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-[var(--color-analysis)]" /> Actual</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-[var(--color-forecast)]" /> Forecast</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-[var(--color-forecast)] opacity-30" /> 80% Confidence band</span>
        </div>
      </Card>

      <Card className="grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4">
        {[
          { label: "Algorithm", value: "Holt-Winters" },
          { label: "RMSE", value: formatNumber(forecast.rmse, { compact: true }) },
          { label: "Horizon", value: `${forecast.horizon} ${forecast.granularity}s` },
          { label: "History points", value: historyPoints.length.toString() },
        ].map((s) => (
          <div key={s.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-sm font-medium">{s.value}</p>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── Predict Tab ────────────────────────────────────────────────────────────

function PredictTab({
  model,
  targetColumn,
  isAdvanced,
}: {
  model: ModelResult | null;
  targetColumn: string | null;
  isAdvanced: boolean;
}) {
  if (!targetColumn) {
    return <EmptyState icon={<Brain className="h-6 w-6" />} title="No target column" description="Mark a target column on the project page to train a predictive model." />;
  }
  if (!model) {
    return <EmptyState icon={<Brain className="h-6 w-6" />} title="Could not train model" description="Need at least 10 rows and one numeric feature to train a model." />;
  }

  const ratingColor: Record<string, string> = {
    Excellent: "text-success",
    Good: "text-analysis",
    Fair: "text-forecast",
    Weak: "text-destructive",
  };

  const importanceData = model.featureImportance.slice(0, 8).map((fi) => ({
    name: fi.feature.slice(0, 20),
    importance: +(fi.importance * 100).toFixed(1),
  }));

  return (
    <div className="space-y-4">
      {/* Model quality card */}
      <Card className="border-forecast/30 bg-forecast/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-forecast">Predictive model</p>
            <h2 className="mt-1 text-sm font-semibold">{model.algorithm}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Target: <span className="font-mono">{model.targetColumn}</span>
            </p>
          </div>
          <Badge variant="outline" className={`border-0 text-base font-bold ${ratingColor[model.qualityRating] ?? ""}`}>
            {model.qualityRating}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-foreground/90">{model.qualityExplanation}</p>

        {/* Metrics grid */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {model.accuracy !== undefined && (
            <MetricPill label="Accuracy" value={`${(model.accuracy * 100).toFixed(1)}%`} />
          )}
          {model.f1 !== undefined && (
            <MetricPill label="F1 Score" value={model.f1.toFixed(3)} />
          )}
          {model.auc !== undefined && (
            <MetricPill label="AUC" value={model.auc.toFixed(3)} />
          )}
          {model.r2 !== undefined && (
            <MetricPill label="R²" value={model.r2.toFixed(3)} />
          )}
          {model.rmse !== undefined && (
            <MetricPill label="RMSE" value={formatNumber(model.rmse, { compact: true })} />
          )}
          {model.mae !== undefined && (
            <MetricPill label="MAE" value={formatNumber(model.mae, { compact: true })} />
          )}
        </div>

        {isAdvanced && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Show raw feature list
            </summary>
            <pre className="mt-2 rounded-md bg-muted/60 p-2 text-[10px] leading-relaxed text-muted-foreground">
              {model.features.join("\n")}
            </pre>
          </details>
        )}
      </Card>

      {/* Feature importance */}
      <Card className="p-4">
        <h3 className="mb-1 text-sm font-semibold">Feature Importance</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Which inputs most influence <span className="font-mono">{model.targetColumn}</span>.
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={importanceData}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} unit="%" />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 11 }}
                formatter={(v: number) => [`${v}%`, "Importance"]}
              />
              <Bar dataKey="importance" fill="var(--color-forecast)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 space-y-1">
          {model.featureImportance.slice(0, 3).map((fi) => (
            <p key={fi.feature} className="text-xs text-muted-foreground">
              → {fi.plainText}
            </p>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ── Cluster Tab ────────────────────────────────────────────────────────────

function ClusterTab({
  clustering,
  schema,
}: {
  clustering: KMeansResult | null;
  schema: ColumnSchema[];
}) {
  if (!clustering || clustering.clusters.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="Clustering not available"
        description={clustering?.plainText ?? "Need at least 2 numeric columns and 6 rows for clustering."}
      />
    );
  }

  // 2D scatter: use first 2 features
  const feat0 = clustering.features[0];
  const feat1 = clustering.features[1];
  const scatterData = clustering.points.slice(0, 500).map((p) => ({
    x: p.features[0],
    y: p.features[1],
    cluster: p.cluster,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Customer Segments</h2>
        <p className="text-xs text-muted-foreground">{clustering.plainText}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clustering.clusters.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-center justify-between">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: CLUSTER_COLORS[c.id % CLUSTER_COLORS.length] }}
              />
              <Badge variant="outline" className="text-xs">
                {(c.pct * 100).toFixed(0)}% · {c.size} rows
              </Badge>
            </div>
            <h3 className="mt-2 font-semibold">{c.label}</h3>
            <div className="mt-2 space-y-1">
              {c.profile.slice(0, 3).map((p) => (
                <div key={p.feature} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{p.feature}</span>
                  <span
                    className={`font-mono ${p.relativeToMean > 0.1 ? "text-success" : p.relativeToMean < -0.1 ? "text-destructive" : ""}`}
                  >
                    {p.relativeToMean > 0 ? "+" : ""}{(p.relativeToMean * 100).toFixed(0)}% vs avg
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {feat0 && feat1 && (
        <Card className="p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            2D projection: <span className="font-mono">{feat0}</span> vs <span className="font-mono">{feat1}</span>
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="x" name={feat0} tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} />
                <YAxis dataKey="y" name={feat1} tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} />
                <Tooltip
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 11 }}
                  cursor={{ strokeDasharray: "3 3" }}
                />
                <Scatter data={scatterData}>
                  {scatterData.map((p, i) => (
                    <Cell
                      key={i}
                      fill={CLUSTER_COLORS[p.cluster % CLUSTER_COLORS.length]}
                      fillOpacity={0.7}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── What-If Tab ────────────────────────────────────────────────────────────

function WhatIfTab({
  model,
  rows,
  schema,
  targetColumn,
}: {
  model: ModelResult | null;
  rows: DataRow[];
  schema: ColumnSchema[];
  targetColumn: string | null;
}) {
  if (!model || !targetColumn) {
    return (
      <EmptyState
        icon={<Sliders className="h-6 w-6" />}
        title="What-If requires a model"
        description="Train a predictive model first by marking a target column on the project page."
      />
    );
  }

  // Get top 4 numeric features for sliders
  const topFeatures = model.featureImportance
    .filter((fi) => !fi.feature.includes("=")) // skip one-hot
    .slice(0, 4)
    .map((fi) => fi.feature);

  const numericColStats: Record<string, { min: number; max: number; mean: number }> = {};
  for (const colName of topFeatures) {
    const vals = rows
      .map((r) => {
        const v = r[colName];
        return typeof v === "number" ? v : Number(v);
      })
      .filter((v) => Number.isFinite(v));
    if (vals.length) {
      numericColStats[colName] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
        mean: vals.reduce((s, v) => s + v, 0) / vals.length,
      };
    }
  }

  // Build baseline feature vector (using means)
  const buildVector = (overrides: Record<string, number>): number[] => {
    return model.features.map((f) => {
      if (f in overrides) return overrides[f];
      // For one-hot features, default to 0
      if (f.includes("=")) return 0;
      const stats = numericColStats[f];
      return stats?.mean ?? 0;
    });
  };

  const [sliderValues, setSliderValues] = useState<Record<string, number>>(
    Object.fromEntries(
      topFeatures.map((f) => [f, numericColStats[f]?.mean ?? 0]),
    ),
  );

  const prediction = useMemo(() => {
    const vec = buildVector(sliderValues);
    try {
      return whatIfPredict(model, vec);
    } catch {
      return null;
    }
  }, [sliderValues, model]);

  const isClassification = model.task !== "regression";
  const displayValue = isClassification
    ? `${((prediction ?? 0) * 100).toFixed(1)}% probability`
    : formatNumber(prediction ?? 0, { compact: true });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">What-If Simulator</h2>
        <p className="text-xs text-muted-foreground">
          Adjust inputs below to see how they affect the predicted <span className="font-mono">{targetColumn}</span>.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-4">
          {topFeatures.map((feature) => {
            const stats = numericColStats[feature];
            if (!stats) return null;
            const current = sliderValues[feature] ?? stats.mean;
            return (
              <Card key={feature} className="p-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{feature}</label>
                  <span className="font-mono text-sm text-forecast">
                    {formatNumber(current, { compact: true })}
                  </span>
                </div>
                <Slider
                  className="mt-3"
                  min={stats.min}
                  max={stats.max}
                  step={(stats.max - stats.min) / 100}
                  value={[current]}
                  onValueChange={([v]) =>
                    setSliderValues((prev) => ({ ...prev, [feature]: v }))
                  }
                />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{formatNumber(stats.min, { compact: true })}</span>
                  <span>avg: {formatNumber(stats.mean, { compact: true })}</span>
                  <span>{formatNumber(stats.max, { compact: true })}</span>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="flex flex-col items-center justify-center border-forecast/30 bg-forecast/5 p-6 text-center">
          <Target className="h-6 w-6 text-forecast" />
          <p className="mt-2 text-xs uppercase tracking-wide text-forecast">Predicted {targetColumn}</p>
          <p className="mt-3 font-mono text-3xl font-bold tabular-nums text-foreground">
            {prediction !== null ? displayValue : "—"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isClassification ? "Probability of positive outcome" : "Estimated value"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() =>
              setSliderValues(
                Object.fromEntries(
                  topFeatures.map((f) => [f, numericColStats[f]?.mean ?? 0]),
                ),
              )
            }
          >
            Reset to averages
          </Button>
        </Card>
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center border-dashed border-border/60 bg-card/50 px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    </Card>
  );
}
