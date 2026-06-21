/**
 * Decision Tree + Random Forest (simplified, browser-runnable).
 * Supports binary classification and regression tasks.
 * Max depth and max features kept small for speed.
 */

export interface TreeNode {
  isLeaf: boolean;
  prediction?: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  impurity?: number;
  samples?: number;
}

export interface RandomForestModel {
  type: "random_forest_classifier" | "random_forest_regressor";
  trees: TreeNode[];
  features: string[];
  numClasses: number;
  featureImportances: number[]; // normalized, same length as features
  accuracy?: number;
  f1?: number;
  r2?: number;
  rmse?: number;
  mae?: number;
}

// ─── Impurity functions ────────────────────────────────────────────────────

function gini(labels: number[]): number {
  if (labels.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  let imp = 1;
  for (const c of counts.values()) {
    const p = c / labels.length;
    imp -= p * p;
  }
  return imp;
}

function mse(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function majorityVote(labels: number[]): number {
  const counts = new Map<number, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  let best = 0;
  let bestCount = -1;
  for (const [l, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = l;
    }
  }
  return best;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

// ─── Decision Tree ──────────────────────────────────────────────────────────

interface BuildOptions {
  maxDepth: number;
  minSamples: number;
  maxFeatures: number;
  task: "classification" | "regression";
  importanceAccumulator: Float64Array;
}

function buildTree(
  X: number[][],
  y: number[],
  depth: number,
  opts: BuildOptions,
): TreeNode {
  const n = y.length;
  if (
    depth >= opts.maxDepth ||
    n <= opts.minSamples ||
    new Set(y).size === 1
  ) {
    return {
      isLeaf: true,
      prediction:
        opts.task === "classification" ? majorityVote(y) : mean(y),
      samples: n,
    };
  }

  const numFeatures = X[0]?.length ?? 0;
  // Random feature subset
  const featureIndices = shuffle(
    Array.from({ length: numFeatures }, (_, i) => i),
  ).slice(0, opts.maxFeatures);

  let bestGain = -Infinity;
  let bestFeature = 0;
  let bestThreshold = 0;
  const parentImpurity =
    opts.task === "classification" ? gini(y) : mse(y);

  for (const fi of featureIndices) {
    const values = X.map((row) => row[fi]);
    const unique = Array.from(new Set(values)).sort((a, b) => a - b);
    for (let ti = 0; ti < unique.length - 1; ti++) {
      const threshold = (unique[ti] + unique[ti + 1]) / 2;
      const leftMask = values.map((v) => v <= threshold);
      const leftY = y.filter((_, i) => leftMask[i]);
      const rightY = y.filter((_, i) => !leftMask[i]);
      if (leftY.length === 0 || rightY.length === 0) continue;
      const leftImp =
        opts.task === "classification" ? gini(leftY) : mse(leftY);
      const rightImp =
        opts.task === "classification" ? gini(rightY) : mse(rightY);
      const gain =
        parentImpurity -
        (leftY.length / n) * leftImp -
        (rightY.length / n) * rightImp;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fi;
        bestThreshold = threshold;
      }
    }
  }

  if (bestGain <= 0) {
    return {
      isLeaf: true,
      prediction:
        opts.task === "classification" ? majorityVote(y) : mean(y),
      samples: n,
    };
  }

  // Accumulate feature importance
  opts.importanceAccumulator[bestFeature] += bestGain * n;

  const leftMask = X.map((row) => row[bestFeature] <= bestThreshold);
  const leftX = X.filter((_, i) => leftMask[i]);
  const leftY = y.filter((_, i) => leftMask[i]);
  const rightX = X.filter((_, i) => !leftMask[i]);
  const rightY = y.filter((_, i) => !leftMask[i]);

  return {
    isLeaf: false,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    impurity: parentImpurity,
    samples: n,
    left: buildTree(leftX, leftY, depth + 1, opts),
    right: buildTree(rightX, rightY, depth + 1, opts),
  };
}

function predictTree(node: TreeNode, row: number[]): number {
  if (node.isLeaf) return node.prediction ?? 0;
  const val = row[node.featureIndex!];
  if (val <= node.threshold!) return predictTree(node.left!, row);
  return predictTree(node.right!, row);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bootstrap<T>(data: T[]): T[] {
  return Array.from({ length: data.length }, () => data[Math.floor(Math.random() * data.length)]);
}

// ─── Random Forest ──────────────────────────────────────────────────────────

export function fitRandomForest(
  X: number[][],
  y: number[],
  features: string[],
  task: "classification" | "regression",
  numTrees = 8,
  maxDepth = 5,
): RandomForestModel {
  const numFeatures = X[0]?.length ?? 1;
  const maxFeat = Math.max(1, Math.round(Math.sqrt(numFeatures)));
  const importanceAcc = new Float64Array(numFeatures);

  const trees: TreeNode[] = [];
  for (let t = 0; t < numTrees; t++) {
    const indices = Array.from({ length: X.length }, (_, i) => i);
    const baggedIndices = bootstrap(indices);
    const baggedX = baggedIndices.map((i) => X[i]);
    const baggedY = baggedIndices.map((i) => y[i]);
    const opts: BuildOptions = {
      maxDepth,
      minSamples: Math.max(2, Math.round(X.length * 0.01)),
      maxFeatures: maxFeat,
      task,
      importanceAccumulator: importanceAcc,
    };
    trees.push(buildTree(baggedX, baggedY, 0, opts));
  }

  // Normalize importances
  const totalImp = importanceAcc.reduce((s, v) => s + v, 0) || 1;
  const featureImportances = Array.from(importanceAcc).map((v) => v / totalImp);

  // Compute metrics on training set (in-sample, optimistic but indicative)
  const numClasses = task === "classification" ? new Set(y).size : 1;
  const preds = X.map((row) => {
    const treePreds = trees.map((t) => predictTree(t, row));
    if (task === "classification") return majorityVote(treePreds);
    return mean(treePreds);
  });

  let accuracy: number | undefined;
  let f1: number | undefined;
  let r2: number | undefined;
  let rmse: number | undefined;
  let mae: number | undefined;

  if (task === "classification") {
    let correct = 0;
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < y.length; i++) {
      if (preds[i] === y[i]) correct++;
      if (preds[i] === 1 && y[i] === 1) tp++;
      if (preds[i] === 1 && y[i] === 0) fp++;
      if (preds[i] === 0 && y[i] === 1) fn++;
    }
    accuracy = correct / y.length;
    const prec = tp / Math.max(tp + fp, 1);
    const rec = tp / Math.max(tp + fn, 1);
    f1 = (2 * prec * rec) / Math.max(prec + rec, 1e-10);
  } else {
    const yMean = mean(y);
    const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
    const ssRes = y.reduce((s, v, i) => s + (v - preds[i]) ** 2, 0);
    r2 = 1 - ssRes / Math.max(ssTot, 1e-10);
    rmse = Math.sqrt(ssRes / y.length);
    mae = y.reduce((s, v, i) => s + Math.abs(v - preds[i]), 0) / y.length;
  }

  return {
    type:
      task === "classification"
        ? "random_forest_classifier"
        : "random_forest_regressor",
    trees,
    features,
    numClasses,
    featureImportances,
    accuracy,
    f1,
    r2,
    rmse,
    mae,
  };
}

export function predictRandomForest(
  model: RandomForestModel,
  row: number[],
): number {
  const treePreds = model.trees.map((t) => predictTree(t, row));
  if (model.type === "random_forest_classifier") {
    return majorityVote(treePreds);
  }
  return mean(treePreds);
}

export function rfFeatureImportance(
  model: RandomForestModel,
): { feature: string; importance: number }[] {
  return model.features
    .map((name, i) => ({ feature: name, importance: model.featureImportances[i] }))
    .sort((a, b) => b.importance - a.importance);
}
