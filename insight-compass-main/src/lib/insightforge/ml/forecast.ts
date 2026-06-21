/**
 * Time-series forecasting using Holt-Winters double exponential smoothing.
 * Supports trend (additive) but no seasonality for simplicity.
 * Returns historical points + forecast + upper/lower 80% confidence bands.
 */

export interface ForecastPoint {
  bucket: string;
  value?: number; // historical
  forecast?: number; // predicted
  lower?: number; // confidence band lower
  upper?: number; // confidence band upper
  isHistory: boolean;
}

export interface ForecastResult {
  metric: string;
  horizon: number;
  granularity: "day" | "week" | "month";
  alpha: number;
  beta: number;
  points: ForecastPoint[];
  rmse: number; // in-sample RMSE
  plainText: string;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function nextBucket(
  bucket: string,
  granularity: "day" | "week" | "month",
  step: number,
): string {
  const d = new Date(bucket);
  if (granularity === "day") return addDays(d, step).toISOString().slice(0, 10);
  if (granularity === "week") return addWeeks(d, step).toISOString().slice(0, 10);
  return addMonths(d, step).toISOString().slice(0, 10);
}

/**
 * Holt-Winters double smoothing.
 * alpha: level smoothing [0,1]
 * beta:  trend smoothing [0,1]
 */
function holtsSmooth(
  values: number[],
  alpha: number,
  beta: number,
): { level: number[]; trend: number[] } {
  const n = values.length;
  if (n < 2) {
    return { level: values.slice(), trend: [0] };
  }
  const level: number[] = new Array(n);
  const trend: number[] = new Array(n);
  level[0] = values[0];
  trend[0] = values[1] - values[0];
  for (let i = 1; i < n; i++) {
    const prevL = level[i - 1];
    const prevT = trend[i - 1];
    level[i] = alpha * values[i] + (1 - alpha) * (prevL + prevT);
    trend[i] = beta * (level[i] - prevL) + (1 - beta) * prevT;
  }
  return { level, trend };
}

function optimizeParams(values: number[]): { alpha: number; beta: number } {
  let bestAlpha = 0.3;
  let bestBeta = 0.1;
  let bestMse = Infinity;
  for (const a of [0.1, 0.2, 0.3, 0.5, 0.7]) {
    for (const b of [0.05, 0.1, 0.2, 0.3]) {
      const { level, trend } = holtsSmooth(values, a, b);
      let mse = 0;
      for (let i = 1; i < values.length; i++) {
        const pred = level[i - 1] + trend[i - 1];
        mse += (values[i] - pred) ** 2;
      }
      mse /= values.length - 1;
      if (mse < bestMse) {
        bestMse = mse;
        bestAlpha = a;
        bestBeta = b;
      }
    }
  }
  return { alpha: bestAlpha, beta: bestBeta };
}

export function runForecast(
  historicalPoints: { bucket: string; value: number }[],
  metric: string,
  horizon: number,
  granularity: "day" | "week" | "month",
): ForecastResult {
  const sorted = [...historicalPoints].sort((a, b) =>
    a.bucket.localeCompare(b.bucket),
  );
  const values = sorted.map((p) => p.value);

  if (values.length < 4) {
    return {
      metric,
      horizon,
      granularity,
      alpha: 0.3,
      beta: 0.1,
      points: sorted.map((p) => ({
        bucket: p.bucket,
        value: p.value,
        isHistory: true,
      })),
      rmse: 0,
      plainText: "Not enough historical data to forecast (need ≥ 4 data points).",
    };
  }

  const { alpha, beta } = optimizeParams(values);
  const { level, trend } = holtsSmooth(values, alpha, beta);

  // In-sample RMSE
  let squaredErr = 0;
  let errCount = 0;
  for (let i = 1; i < values.length; i++) {
    const pred = level[i - 1] + trend[i - 1];
    squaredErr += (values[i] - pred) ** 2;
    errCount++;
  }
  const rmse = errCount > 0 ? Math.sqrt(squaredErr / errCount) : 0;

  // Build confidence band: 80% ≈ ±1.28 * rmse * sqrt(step)
  const lastLevel = level[level.length - 1];
  const lastTrend = trend[trend.length - 1];
  const lastBucket = sorted[sorted.length - 1].bucket;

  const histPoints: ForecastPoint[] = sorted.map((p) => ({
    bucket: p.bucket,
    value: p.value,
    isHistory: true,
  }));

  const futurePoints: ForecastPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const forecastVal = lastLevel + lastTrend * h;
    const uncertainty = 1.28 * rmse * Math.sqrt(h);
    futurePoints.push({
      bucket: nextBucket(lastBucket, granularity, h),
      forecast: Math.max(0, forecastVal),
      lower: Math.max(0, forecastVal - uncertainty),
      upper: forecastVal + uncertainty,
      isHistory: false,
    });
  }

  const lastHistVal = values[values.length - 1];
  const forecastEnd = futurePoints[futurePoints.length - 1]?.forecast ?? lastHistVal;
  const changePct = lastHistVal !== 0 ? ((forecastEnd - lastHistVal) / Math.abs(lastHistVal)) * 100 : 0;
  const direction = changePct >= 0 ? "increase" : "decrease";
  const granularityLabel = granularity === "day" ? "days" : granularity === "week" ? "weeks" : "months";
  const qualityLabel = rmse / (lastHistVal || 1) < 0.1 ? "high" : rmse / (lastHistVal || 1) < 0.3 ? "moderate" : "low";

  const plainText = `Based on ${values.length} historical ${granularityLabel}, ${metric} is forecast to ${direction} by ${Math.abs(changePct).toFixed(1)}% over the next ${horizon} ${granularityLabel}. Forecast confidence is ${qualityLabel} (RMSE = ${rmse.toFixed(0)}).`;

  return {
    metric,
    horizon,
    granularity,
    alpha,
    beta,
    points: [...histPoints, ...futurePoints],
    rmse,
    plainText,
  };
}
