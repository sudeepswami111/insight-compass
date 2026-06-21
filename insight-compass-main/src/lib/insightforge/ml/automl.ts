/**
 * AutoML orchestrator: picks the best model for a given dataset + target.
 * Runs Logistic/Linear Regression and Random Forest, picks winner.
 * Returns a unified ModelResult regardless of which algorithm won.
 */

import type { DataRow, ColumnSchema } from "../types";
import {
  prepareDataset,
  fitLinearRegression,
  fitLogisticRegression,
  linearFeatureImportance,
  predictLinear,
  predictLogistic,
  type LinearRegressionModel,
  type LogisticRegressionModel,
} from "./regression";
import {
  fitRandomForest,
  rfFeatureImportance,
  predictRandomForest,
  type RandomForestModel,
} from "./randomForest";

export type TaskKind = "binary_classification" | "multiclass" | "regression";

export interface FeatureImportanceItem {
  feature: string;
  importance: number;
  plainText: string;
}

export interface ModelResult {
  task: TaskKind;
  algorithm: string;
  features: string[];
  targetColumn: string;
  featureImportance: FeatureImportanceItem[];
  // Classification metrics
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  auc?: number;
  // Regression metrics
  r2?: number;
  rmse?: number;
  mae?: number;
  // Serialized model for what-if
  _model: LinearRegressionModel | LogisticRegressionModel | RandomForestModel;
  _labelMap?: Map<string, number>;
  // Plain language
  qualityRating: string;
  qualityExplanation: string;
}

function detectTask(
  rows: DataRow[],
  schema: ColumnSchema[],
  targetColumn: string,
): TaskKind {
  const col = schema.find((c) => c.name === targetColumn);
  if (!col) return "regression";
  const t = col.overrideType ?? col.inferredType;
  if (t === "numeric") return "regression";
  if (col.uniqueCount <= 2) return "binary_classification";
  return "multiclass";
}

function qualityRating(task: TaskKind, result: Partial<ModelResult>): {
  rating: string;
  explanation: string;
} {
  if (task === "regression") {
    const r2 = result.r2 ?? 0;
    if (r2 >= 0.8)
      return {
        rating: "Excellent",
        explanation: `R² = ${r2.toFixed(2)} — the model explains ${(r2 * 100).toFixed(0)}% of variance. Strong predictive power.`,
      };
    if (r2 >= 0.5)
      return {
        rating: "Good",
        explanation: `R² = ${r2.toFixed(2)} — the model explains ${(r2 * 100).toFixed(0)}% of variance. Useful directionally.`,
      };
    if (r2 >= 0.2)
      return {
        rating: "Fair",
        explanation: `R² = ${r2.toFixed(2)} — the model captures some signal but misses a lot. More data or features may help.`,
      };
    return {
      rating: "Weak",
      explanation: `R² = ${r2.toFixed(2)} — the model is not very predictive. The target may not be linearly related to these features.`,
    };
  } else {
    const acc = result.accuracy ?? 0;
    if (acc >= 0.9)
      return {
        rating: "Excellent",
        explanation: `${(acc * 100).toFixed(0)}% accuracy — very confident predictions on held-out data.`,
      };
    if (acc >= 0.75)
      return {
        rating: "Good",
        explanation: `${(acc * 100).toFixed(0)}% accuracy — reliable for most business decisions.`,
      };
    if (acc >= 0.6)
      return {
        rating: "Fair",
        explanation: `${(acc * 100).toFixed(0)}% accuracy — useful as a signal, but verify before acting on predictions.`,
      };
    return {
      rating: "Weak",
      explanation: `${(acc * 100).toFixed(0)}% accuracy — only slightly better than random. Consider more features or more data.`,
    };
  }
}

function buildFeatureExplanations(
  items: { feature: string; importance: number }[],
  targetColumn: string,
  task: TaskKind,
): FeatureImportanceItem[] {
  return items.slice(0, 10).map((item, rank) => {
    const pct = (item.importance * 100).toFixed(0);
    const verb = task === "regression" ? "drives" : "predicts";
    const rankWord = rank === 0 ? "most strongly" : rank === 1 ? "second most" : `#${rank + 1}`;
    return {
      ...item,
      plainText: `${item.feature.replace(/=/g, " = ")} ${verb} ${targetColumn} ${rankWord} (${pct}% of model weight).`,
    };
  });
}

export function runAutoML(
  rows: DataRow[],
  schema: ColumnSchema[],
  targetColumn: string,
): ModelResult | null {
  if (rows.length < 10) return null;

  const task = detectTask(rows, schema, targetColumn);
  const { X, y, features, labelMap } = prepareDataset(rows, schema, targetColumn);

  if (X.length === 0 || features.length === 0) return null;

  // Cap dataset for performance in browser
  const MAX_ROWS = 2000;
  const Xsampled = X.length > MAX_ROWS ? X.slice(0, MAX_ROWS) : X;
  const ysampled = y.slice(0, MAX_ROWS);

  let winner: ModelResult;

  if (task === "binary_classification") {
    const lr = fitLogisticRegression(Xsampled, ysampled, features);
    const rf = fitRandomForest(Xsampled, ysampled, features, "classification", 8, 4);

    // Pick by F1
    const lrF1 = lr.f1;
    const rfF1 = rf.f1 ?? 0;
    const useLR = lrF1 >= rfF1;

    if (useLR) {
      const importance = buildFeatureExplanations(
        linearFeatureImportance(lr),
        targetColumn,
        task,
      );
      const q = qualityRating(task, { accuracy: lr.accuracy, f1: lr.f1 });
      winner = {
        task,
        algorithm: "Logistic Regression",
        features,
        targetColumn,
        featureImportance: importance,
        accuracy: lr.accuracy,
        precision: lr.precision,
        recall: lr.recall,
        f1: lr.f1,
        auc: lr.auc,
        _model: lr,
        _labelMap: labelMap,
        qualityRating: q.rating,
        qualityExplanation: q.explanation,
      };
    } else {
      const importance = buildFeatureExplanations(
        rfFeatureImportance(rf),
        targetColumn,
        task,
      );
      const q = qualityRating(task, { accuracy: rf.accuracy, f1: rf.f1 });
      winner = {
        task,
        algorithm: "Random Forest Classifier",
        features,
        targetColumn,
        featureImportance: importance,
        accuracy: rf.accuracy,
        f1: rf.f1,
        _model: rf,
        _labelMap: labelMap,
        qualityRating: q.rating,
        qualityExplanation: q.explanation,
      };
    }
  } else if (task === "regression") {
    const lr = fitLinearRegression(Xsampled, ysampled, features);
    const rf = fitRandomForest(Xsampled, ysampled, features, "regression", 8, 4);

    const useLR = (lr.r2 ?? 0) >= (rf.r2 ?? 0);

    if (useLR) {
      const importance = buildFeatureExplanations(
        linearFeatureImportance(lr),
        targetColumn,
        task,
      );
      const q = qualityRating(task, { r2: lr.r2 });
      winner = {
        task,
        algorithm: "Linear Regression",
        features,
        targetColumn,
        featureImportance: importance,
        r2: lr.r2,
        rmse: lr.rmse,
        mae: lr.mae,
        _model: lr,
        qualityRating: q.rating,
        qualityExplanation: q.explanation,
      };
    } else {
      const importance = buildFeatureExplanations(
        rfFeatureImportance(rf),
        targetColumn,
        task,
      );
      const q = qualityRating(task, { r2: rf.r2 });
      winner = {
        task,
        algorithm: "Random Forest Regressor",
        features,
        targetColumn,
        featureImportance: importance,
        r2: rf.r2,
        rmse: rf.rmse,
        mae: rf.mae,
        _model: rf,
        qualityRating: q.rating,
        qualityExplanation: q.explanation,
      };
    }
  } else {
    // multiclass: just use random forest
    const rf = fitRandomForest(Xsampled, ysampled, features, "classification", 8, 4);
    const importance = buildFeatureExplanations(
      rfFeatureImportance(rf),
      targetColumn,
      task,
    );
    const q = qualityRating("binary_classification", { accuracy: rf.accuracy, f1: rf.f1 });
    winner = {
      task,
      algorithm: "Random Forest Classifier",
      features,
      targetColumn,
      featureImportance: importance,
      accuracy: rf.accuracy,
      f1: rf.f1,
      _model: rf,
      _labelMap: labelMap,
      qualityRating: q.rating,
      qualityExplanation: q.explanation,
    };
  }

  return winner;
}

/** Predict on a custom feature vector for what-if simulation. */
export function whatIfPredict(
  result: ModelResult,
  featureValues: number[],
): number {
  const model = result._model;
  if (model.type === "logistic") {
    return predictLogistic(model, featureValues).prob;
  }
  if (model.type === "linear") {
    return predictLinear(model, featureValues);
  }
  // Random forest
  return predictRandomForest(model, featureValues);
}
