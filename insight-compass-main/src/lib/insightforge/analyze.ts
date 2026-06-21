import type { ColumnSchema, DataRow } from "./types";

export interface DescriptiveStat {
  column: string;
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
}

export interface TrendPoint {
  bucket: string; // YYYY-MM-DD
  value: number;
  count: number;
}

export interface TrendSeries {
  metric: string;
  dateColumn: string;
  granularity: "day" | "week" | "month";
  points: TrendPoint[];
  totalCurrent: number;
  totalPrevious: number;
  deltaPct: number; // MoM-ish delta of last vs prior bucket
  rollingMean: number[]; // same length as points
  anomalies: { bucket: string; value: number; z: number }[];
}

export interface SegmentRow {
  segment: string;
  metric: number;
  count: number;
}

export interface SegmentBreakdown {
  dimension: string;
  metric: string;
  rows: SegmentRow[];
}

export interface CorrelationPair {
  a: string;
  b: string;
  r: number;
}

export interface CorrelationMatrix {
  columns: string[];
  matrix: number[][]; // square
  topPairs: CorrelationPair[];
}

export interface AnalysisResult {
  rowCount: number;
  columnCount: number;
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumn: string | null;
  targetColumn: string | null;
  descriptive: DescriptiveStat[];
  trends: TrendSeries[];
  segments: SegmentBreakdown[];
  correlation: CorrelationMatrix | null;
  topCategoricalCounts: { column: string; values: { name: string; count: number }[] }[];
  targetSummary: {
    column: string;
    kind: "binary" | "categorical" | "numeric";
    distribution: { name: string; count: number; pct: number }[];
    positiveRate?: number;
  } | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function describe(values: number[]): Omit<DescriptiveStat, "column"> {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, p25: 0, p75: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return {
    count: values.length,
    mean,
    median: quantile(sorted, 0.5),
    stdDev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

function pickGranularity(spanDays: number): "day" | "week" | "month" {
  if (spanDays <= 90) return "day";
  if (spanDays <= 540) return "week";
  return "month";
}

function bucketKey(d: Date, g: "day" | "week" | "month"): string {
  if (g === "day") return d.toISOString().slice(0, 10);
  if (g === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  // week (ISO Monday)
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

function buildTrend(
  rows: DataRow[],
  dateColumn: string,
  metric: string,
): TrendSeries | null {
  const points: { d: Date; v: number }[] = [];
  for (const r of rows) {
    const rawDate = r[dateColumn];
    const rawVal = r[metric];
    if (rawDate === null || rawDate === undefined || rawDate === "") continue;
    const t = new Date(String(rawDate));
    if (isNaN(t.getTime())) continue;
    const n = num(rawVal);
    if (n === null) continue;
    points.push({ d: t, v: n });
  }
  if (points.length < 2) return null;
  points.sort((a, b) => a.d.getTime() - b.d.getTime());
  const spanDays =
    (points[points.length - 1].d.getTime() - points[0].d.getTime()) / 86400000;
  const g = pickGranularity(spanDays);
  const map = new Map<string, { sum: number; count: number }>();
  for (const p of points) {
    const key = bucketKey(p.d, g);
    const cur = map.get(key) ?? { sum: 0, count: 0 };
    cur.sum += p.v;
    cur.count += 1;
    map.set(key, cur);
  }
  const out: TrendPoint[] = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, agg]) => ({ bucket, value: agg.sum, count: agg.count }));

  // rolling mean (window 7 for day, 4 for week, 3 for month)
  const window = g === "day" ? 7 : g === "week" ? 4 : 3;
  const rolling: number[] = out.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = out.slice(start, i + 1);
    return slice.reduce((s, p) => s + p.value, 0) / slice.length;
  });

  // anomaly: z-score on residual vs rolling mean
  const residuals = out.map((p, i) => p.value - rolling[i]);
  const rMean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
  const rStd =
    Math.sqrt(
      residuals.reduce((s, v) => s + (v - rMean) ** 2, 0) / Math.max(1, residuals.length - 1),
    ) || 1;
  const anomalies = out
    .map((p, i) => ({ bucket: p.bucket, value: p.value, z: (residuals[i] - rMean) / rStd }))
    .filter((a) => Math.abs(a.z) >= 2.5);

  const last = out[out.length - 1].value;
  const prev = out.length >= 2 ? out[out.length - 2].value : last;
  const deltaPct = prev === 0 ? 0 : (last - prev) / Math.abs(prev);

  return {
    metric,
    dateColumn,
    granularity: g,
    points: out,
    totalCurrent: last,
    totalPrevious: prev,
    deltaPct,
    rollingMean: rolling,
    anomalies,
  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  let sx = 0,
    sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n,
    my = sy / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  if (!denom) return 0;
  return num / denom;
}

export function analyzeDataset(
  rows: DataRow[],
  schema: ColumnSchema[],
  opts: { dateColumn?: string | null; targetColumn?: string | null } = {},
): AnalysisResult {
  const typeOf = (c: ColumnSchema) => c.overrideType ?? c.inferredType;
  const numericColumns = schema.filter((c) => typeOf(c) === "numeric").map((c) => c.name);
  const categoricalColumns = schema
    .filter((c) => {
      const t = typeOf(c);
      return t === "categorical" || t === "boolean";
    })
    .map((c) => c.name);

  const descriptive: DescriptiveStat[] = numericColumns.map((col) => {
    const vals = rows.map((r) => num(r[col])).filter((v): v is number => v !== null);
    return { column: col, ...describe(vals) };
  });

  const dateColumn = opts.dateColumn ?? null;
  const trends: TrendSeries[] = [];
  if (dateColumn) {
    // pick top 3 numeric metrics by stddev (most "interesting")
    const ranked = [...descriptive].sort((a, b) => b.stdDev - a.stdDev).slice(0, 3);
    for (const d of ranked) {
      const t = buildTrend(rows, dateColumn, d.column);
      if (t) trends.push(t);
    }
  }

  // Segments: each categorical x first numeric metric (or target if numeric)
  const segMetric =
    (opts.targetColumn && numericColumns.includes(opts.targetColumn)
      ? opts.targetColumn
      : descriptive[0]?.column) ?? null;
  const segments: SegmentBreakdown[] = [];
  if (segMetric) {
    for (const dim of categoricalColumns.slice(0, 4)) {
      const map = new Map<string, { sum: number; count: number }>();
      for (const r of rows) {
        const k = str(r[dim]);
        const v = num(r[segMetric]);
        if (k === null || v === null) continue;
        const cur = map.get(k) ?? { sum: 0, count: 0 };
        cur.sum += v;
        cur.count += 1;
        map.set(k, cur);
      }
      const rowsOut: SegmentRow[] = [...map.entries()]
        .map(([segment, a]) => ({ segment, metric: a.sum, count: a.count }))
        .sort((a, b) => b.metric - a.metric)
        .slice(0, 10);
      if (rowsOut.length > 1) {
        segments.push({ dimension: dim, metric: segMetric, rows: rowsOut });
      }
    }
  }

  // Correlation matrix on numeric columns
  let correlation: CorrelationMatrix | null = null;
  if (numericColumns.length >= 2) {
    const cols = numericColumns.slice(0, 8);
    const series: Record<string, number[]> = {};
    for (const c of cols) {
      series[c] = rows.map((r) => num(r[c]) ?? NaN);
    }
    const matrix: number[][] = cols.map(() => cols.map(() => 0));
    const pairs: CorrelationPair[] = [];
    for (let i = 0; i < cols.length; i++) {
      for (let j = 0; j < cols.length; j++) {
        if (i === j) {
          matrix[i][j] = 1;
          continue;
        }
        if (j < i) {
          matrix[i][j] = matrix[j][i];
          continue;
        }
        const xs: number[] = [];
        const ys: number[] = [];
        for (let k = 0; k < rows.length; k++) {
          const a = series[cols[i]][k];
          const b = series[cols[j]][k];
          if (Number.isFinite(a) && Number.isFinite(b)) {
            xs.push(a);
            ys.push(b);
          }
        }
        const r = pearson(xs, ys);
        matrix[i][j] = r;
        pairs.push({ a: cols[i], b: cols[j], r });
      }
    }
    const topPairs = pairs
      .filter((p) => Number.isFinite(p.r))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      .slice(0, 5);
    correlation = { columns: cols, matrix, topPairs };
  }

  const topCategoricalCounts = categoricalColumns.slice(0, 4).map((col) => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = str(r[col]);
      if (k === null) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    const values = [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return { column: col, values };
  });

  // Target summary
  let targetSummary: AnalysisResult["targetSummary"] = null;
  if (opts.targetColumn) {
    const col = opts.targetColumn;
    const colSchema = schema.find((c) => c.name === col);
    const t = colSchema ? typeOf(colSchema) : null;
    if (t === "numeric") {
      const vals = rows.map((r) => num(r[col])).filter((v): v is number => v !== null);
      const stats = describe(vals);
      targetSummary = {
        column: col,
        kind: "numeric",
        distribution: [
          { name: "min", count: stats.min, pct: 0 },
          { name: "median", count: stats.median, pct: 0 },
          { name: "max", count: stats.max, pct: 0 },
        ],
      };
    } else {
      const map = new Map<string, number>();
      let total = 0;
      for (const r of rows) {
        const v = r[col];
        if (v === null || v === undefined || v === "") continue;
        const k = String(v);
        map.set(k, (map.get(k) ?? 0) + 1);
        total += 1;
      }
      const distribution = [...map.entries()]
        .map(([name, count]) => ({ name, count, pct: total ? count / total : 0 }))
        .sort((a, b) => b.count - a.count);
      const kind: "binary" | "categorical" =
        distribution.length === 2 ? "binary" : "categorical";
      const positiveRate =
        kind === "binary"
          ? (() => {
              const pos =
                distribution.find((d) =>
                  ["true", "1", "yes", "y"].includes(d.name.toLowerCase()),
                ) ?? distribution[1];
              return pos ? pos.pct : 0;
            })()
          : undefined;
      targetSummary = { column: col, kind, distribution, positiveRate };
    }
  }

  return {
    rowCount: rows.length,
    columnCount: schema.length,
    numericColumns,
    categoricalColumns,
    dateColumn,
    targetColumn: opts.targetColumn ?? null,
    descriptive,
    trends,
    segments,
    correlation,
    topCategoricalCounts,
    targetSummary,
  };
}

export function formatNumber(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (opts.compact && abs >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(3);
}

export function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}