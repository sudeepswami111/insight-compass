/**
 * Linear and Logistic Regression implementations.
 * All computation runs in the browser (no external dependencies).
 */

import type { DataRow, ColumnSchema } from "../types";

// ─── helpers ────────────────────────────────────────────────────────────────

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
}

export interface NormParams {
  mean: number[];
  std: number[];
}

export function normalizeFeatures(
  X: number[][],
): { Xn: number[][]; params: NormParams } {
  if (X.length === 0) return { Xn: [], params: { mean: [], std: [] } };
  const cols = X[0].length;
  const mean: number[] = Array(cols).fill(0);
  const std: number[] = Array(cols).fill(1);
  for (let j = 0; j < cols; j++) {
    const vals = X.map((r) => r[j]);
    mean[j] = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance =
      vals.reduce((s, v) => s + (v - mean[j]) ** 2, 0) / Math.max(1, vals.length - 1);
    std[j] = Math.sqrt(variance) || 1;
  }
  const Xn = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { Xn, params: { mean, std } };
}

export function applyNorm(row: number[], params: NormParams): number[] {
  return row.map((v, j) => (v - params.mean[j]) / (params.std[j] || 1));
}

// ─── Linear Regression (OLS via gradient descent) ────────────────────────────

export interface LinearRegressionModel {
  type: "linear";
  weights: number[]; // [w0(bias), w1, w2, ...]
  features: string[];
  normParams: NormParams;
  r2: number;
  rmse: number;
  mae: number;
}

export function fitLinearRegression(
  X: number[][],
  y: number[],
  features: string[],
  iterations = 1000,
  lr = 0.01,
): LinearRegressionModel {
  const { Xn, params } = normalizeFeatures(X);
  const n = Xn.length;
  const cols = Xn[0]?.length ?? 0;
  // add bias
  const Xb = Xn.map((row) => [1, ...row]);
  let w: number[] = Array(cols + 1).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    const grad = Array(w.length).fill(0);
    for (let i = 0; i < n; i++) {
      const pred = dot(w, Xb[i]);
      const err = pred - y[i];
      for (let j = 0; j < w.length; j++) grad[j] += (err * Xb[i][j]) / n;
    }
    w = w.map((wj, j) => wj - lr * grad[j]);
  }

  // metrics
  const preds = Xb.map((row) => dot(w, row));
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - preds[i]) ** 2, 0);
  const r2 = 1 - ssRes / Math.max(ssTot, 1e-10);
  const rmse = Math.sqrt(ssRes / n);
  const mae = y.reduce((s, v, i) => s + Math.abs(v - preds[i]), 0) / n;

  return { type: "linear", weights: w, features, normParams: params, r2, rmse, mae };
}

export function predictLinear(model: LinearRegressionModel, row: number[]): number {
  const xn = applyNorm(row, model.normParams);
  return dot(model.weights, [1, ...xn]);
}

// ─── Logistic Regression (binary classification) ──────────────────────────

export interface LogisticRegressionModel {
  type: "logistic";
  weights: number[];
  features: string[];
  normParams: NormParams;
  threshold: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number; // approx
}

export function fitLogisticRegression(
  X: number[][],
  y: number[], // 0 or 1
  features: string[],
  iterations = 500,
  lr = 0.1,
): LogisticRegressionModel {
  const { Xn, params } = normalizeFeatures(X);
  const n = Xn.length;
  const cols = Xn[0]?.length ?? 0;
  const Xb = Xn.map((row) => [1, ...row]);
  let w: number[] = Array(cols + 1).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    const grad = Array(w.length).fill(0);
    for (let i = 0; i < n; i++) {
      const prob = sigmoid(dot(w, Xb[i]));
      const err = prob - y[i];
      for (let j = 0; j < w.length; j++) grad[j] += (err * Xb[i][j]) / n;
    }
    w = w.map((wj, j) => wj - lr * grad[j]);
  }

  // Find best threshold (maximize F1)
  const probs = Xb.map((row) => sigmoid(dot(w, row)));
  let bestF1 = -1;
  let bestThreshold = 0.5;
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const m = computeClassMetrics(probs, y, t);
    if (m.f1 > bestF1) {
      bestF1 = m.f1;
      bestThreshold = t;
    }
  }
  const metrics = computeClassMetrics(probs, y, bestThreshold);

  // Approx AUC via trapezoidal
  const sorted = probs.map((p, i) => ({ p, label: y[i] })).sort((a, b) => b.p - a.p);
  let tp = 0, fp = 0;
  const pos = y.filter((v) => v === 1).length;
  const neg = y.length - pos;
  let auc = 0;
  let prevFp = 0;
  for (const { label } of sorted) {
    if (label === 1) tp++;
    else {
      fp++;
      auc += (tp / Math.max(pos, 1)) * (1 / Math.max(neg, 1));
      prevFp = fp;
    }
  }

  return {
    type: "logistic",
    weights: w,
    features,
    normParams: params,
    threshold: bestThreshold,
    accuracy: metrics.accuracy,
    precision: metrics.precision,
    recall: metrics.recall,
    f1: metrics.f1,
    auc: Math.min(1, auc),
  };
}

function computeClassMetrics(
  probs: number[],
  y: number[],
  threshold: number,
): { accuracy: number; precision: number; recall: number; f1: number } {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < probs.length; i++) {
    const pred = probs[i] >= threshold ? 1 : 0;
    if (pred === 1 && y[i] === 1) tp++;
    else if (pred === 0 && y[i] === 0) tn++;
    else if (pred === 1 && y[i] === 0) fp++;
    else fn++;
  }
  const accuracy = (tp + tn) / probs.length;
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  const f1 = (2 * precision * recall) / Math.max(precision + recall, 1e-10);
  return { accuracy, precision, recall, f1 };
}

export function predictLogistic(
  model: LogisticRegressionModel,
  row: number[],
): { prob: number; label: number } {
  const xn = applyNorm(row, model.normParams);
  const prob = sigmoid(dot(model.weights, [1, ...xn]));
  return { prob, label: prob >= model.threshold ? 1 : 0 };
}

// ─── Feature importance for linear models ─────────────────────────────────

export function linearFeatureImportance(
  model: LinearRegressionModel | LogisticRegressionModel,
): { feature: string; importance: number }[] {
  // Use absolute weight magnitude (skip bias at index 0)
  const raw = model.features.map((name, i) => ({
    feature: name,
    importance: Math.abs(model.weights[i + 1] ?? 0),
  }));
  const total = raw.reduce((s, r) => s + r.importance, 0) || 1;
  return raw
    .map((r) => ({ ...r, importance: r.importance / total }))
    .sort((a, b) => b.importance - a.importance);
}

// ─── Dataset preparation ────────────────────────────────────────────────────

/** Convert rows + schema to numeric feature matrix and target vector. */
export function prepareDataset(
  rows: DataRow[],
  schema: ColumnSchema[],
  targetColumn: string,
  featureColumns?: string[],
): {
  X: number[][];
  y: number[];
  features: string[];
  labelMap?: Map<string, number>;
} {
  const typeOf = (c: ColumnSchema) => c.overrideType ?? c.inferredType;

  const usableFeatures = (featureColumns ?? schema.map((c) => c.name)).filter(
    (name) => {
      if (name === targetColumn) return false;
      const col = schema.find((c) => c.name === name);
      if (!col) return false;
      const t = typeOf(col);
      return t === "numeric" || t === "boolean" || t === "categorical";
    },
  );

  // Build feature matrix
  // For categoricals: one-hot encode (max 5 categories to avoid explosion)
  const expandedFeatures: string[] = [];
  const encoders: {
    col: string;
    kind: "numeric" | "onehot";
    categories?: string[];
  }[] = [];

  for (const name of usableFeatures) {
    const col = schema.find((c) => c.name === name)!;
    const t = typeOf(col);
    if (t === "numeric" || t === "boolean") {
      expandedFeatures.push(name);
      encoders.push({ col: name, kind: "numeric" });
    } else if (t === "categorical" && col.uniqueCount <= 6) {
      const cats = Array.from(
        new Set(rows.map((r) => String(r[name] ?? "")).filter(Boolean)),
      ).slice(0, 5);
      for (const cat of cats.slice(1)) {
        // drop first to avoid multicollinearity
        expandedFeatures.push(`${name}=${cat}`);
      }
      encoders.push({ col: name, kind: "onehot", categories: cats });
    }
  }

  // Build target vector
  const targetCol = schema.find((c) => c.name === targetColumn);
  const targetType = targetCol ? typeOf(targetCol) : "text";
  let labelMap: Map<string, number> | undefined;
  let y: number[];

  if (targetType === "numeric") {
    y = rows.map((r) => {
      const v = r[targetColumn];
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    });
  } else {
    // Encode as 0/1 (binary) or ordinal
    const uniq = Array.from(new Set(rows.map((r) => String(r[targetColumn] ?? ""))));
    labelMap = new Map(uniq.map((v, i) => [v, i]));
    // For binary, make the "positive" class = 1
    const posPatterns = /^(1|true|yes|y|churned|converted|purchased|signup)$/i;
    if (uniq.length === 2) {
      const pos = uniq.find((v) => posPatterns.test(v)) ?? uniq[1];
      labelMap = new Map(uniq.map((v) => [v, v === pos ? 1 : 0]));
    }
    y = rows.map((r) => labelMap!.get(String(r[targetColumn] ?? "")) ?? 0);
  }

  const X: number[][] = rows.map((row) => {
    const featureVec: number[] = [];
    for (const enc of encoders) {
      const rawVal = row[enc.col];
      if (enc.kind === "numeric") {
        const n = typeof rawVal === "number" ? rawVal : Number(rawVal);
        featureVec.push(Number.isFinite(n) ? n : 0);
      } else {
        const strVal = String(rawVal ?? "");
        for (const cat of (enc.categories ?? []).slice(1)) {
          featureVec.push(strVal === cat ? 1 : 0);
        }
      }
    }
    return featureVec;
  });

  return { X, y, features: expandedFeatures, labelMap };
}
