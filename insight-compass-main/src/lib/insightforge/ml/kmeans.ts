/**
 * K-Means Clustering (k=2..6, auto-select via silhouette score).
 */

export interface ClusterPoint {
  rowIndex: number;
  cluster: number;
  features: number[];
}

export interface ClusterInfo {
  id: number;
  label: string; // auto-generated name
  centroid: number[];
  size: number;
  pct: number;
  profile: { feature: string; value: number; relativeToMean: number }[];
}

export interface KMeansResult {
  k: number;
  clusters: ClusterInfo[];
  points: ClusterPoint[];
  silhouette: number;
  features: string[];
  plainText: string;
}

function euclidean(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function initCentroids(X: number[][], k: number): number[][] {
  // k-means++ initialization
  const centroids: number[][] = [];
  centroids.push(X[Math.floor(Math.random() * X.length)]);
  while (centroids.length < k) {
    const dists = X.map((p) =>
      Math.min(...centroids.map((c) => euclidean(p, c))),
    );
    const total = dists.reduce((s, d) => s + d * d, 0);
    let r = Math.random() * total;
    for (let i = 0; i < X.length; i++) {
      r -= dists[i] * dists[i];
      if (r <= 0) {
        centroids.push(X[i]);
        break;
      }
    }
    if (centroids.length < k) centroids.push(X[X.length - 1]);
  }
  return centroids;
}

function assignClusters(X: number[][], centroids: number[][]): number[] {
  return X.map((p) => {
    let bestDist = Infinity;
    let best = 0;
    for (let c = 0; c < centroids.length; c++) {
      const d = euclidean(p, centroids[c]);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  });
}

function updateCentroids(X: number[][], assignments: number[], k: number): number[][] {
  const dims = X[0]?.length ?? 0;
  const sums: number[][] = Array.from({ length: k }, () => Array(dims).fill(0));
  const counts: number[] = Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const c = assignments[i];
    counts[c]++;
    for (let d = 0; d < dims; d++) sums[c][d] += X[i][d];
  }
  return sums.map((s, c) =>
    counts[c] > 0 ? s.map((v) => v / counts[c]) : X[Math.floor(Math.random() * X.length)],
  );
}

function silhouetteScore(X: number[][], assignments: number[], k: number): number {
  if (k < 2 || X.length < k * 2) return 0;
  const sample = X.slice(0, 200); // cap for performance
  const sampleAssign = assignments.slice(0, 200);
  let total = 0;
  for (let i = 0; i < sample.length; i++) {
    const ci = sampleAssign[i];
    const same = sample.filter((_, j) => sampleAssign[j] === ci && j !== i);
    if (same.length === 0) continue;
    const a = same.reduce((s, p) => s + euclidean(sample[i], p), 0) / same.length;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === ci) continue;
      const other = sample.filter((_, j) => sampleAssign[j] === c);
      if (other.length === 0) continue;
      const dist = other.reduce((s, p) => s + euclidean(sample[i], p), 0) / other.length;
      if (dist < b) b = dist;
    }
    const s = (b - a) / Math.max(a, b);
    total += s;
  }
  return total / sample.length;
}

function runKMeans(
  X: number[][],
  k: number,
  maxIter = 50,
): { assignments: number[]; centroids: number[][]; silhouette: number } {
  let centroids = initCentroids(X, k);
  let assignments = assignClusters(X, centroids);
  for (let iter = 0; iter < maxIter; iter++) {
    const newCentroids = updateCentroids(X, assignments, k);
    const newAssignments = assignClusters(X, newCentroids);
    const changed = newAssignments.some((a, i) => a !== assignments[i]);
    assignments = newAssignments;
    centroids = newCentroids;
    if (!changed) break;
  }
  const sil = silhouetteScore(X, assignments, k);
  return { assignments, centroids, silhouette: sil };
}

function normalizeForClustering(X: number[][]): {
  Xn: number[][];
  means: number[];
  stds: number[];
} {
  if (X.length === 0) return { Xn: [], means: [], stds: [] };
  const dims = X[0].length;
  const means = Array(dims).fill(0);
  const stds = Array(dims).fill(1);
  for (let d = 0; d < dims; d++) {
    const vals = X.map((r) => r[d]);
    means[d] = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance =
      vals.reduce((s, v) => s + (v - means[d]) ** 2, 0) / Math.max(1, vals.length - 1);
    stds[d] = Math.sqrt(variance) || 1;
  }
  const Xn = X.map((row) => row.map((v, d) => (v - means[d]) / stds[d]));
  return { Xn, means, stds };
}

/** Auto-generate a cluster label from its centroid vs global means. */
function autoLabel(
  centroid: number[],
  globalMeans: number[],
  features: string[],
  clusterSize: number,
  totalSize: number,
): string {
  const relativeValues = centroid.map((v, i) => v - globalMeans[i]);
  const maxIdx = relativeValues.reduce(
    (best, v, i) => (Math.abs(v) > Math.abs(relativeValues[best]) ? i : best),
    0,
  );
  const dominant = features[maxIdx]?.replace(/_/g, " ") ?? "feature";
  const isHigh = relativeValues[maxIdx] > 0;
  const sizePct = clusterSize / totalSize;

  if (sizePct > 0.5) return `Main Group`;
  if (isHigh) {
    if (/churn|leave|cancel/i.test(dominant)) return "At-Risk";
    if (/revenue|value|spend/i.test(dominant)) return "High Value";
    if (/signups|growth|new/i.test(dominant)) return "Growth Segment";
    return `High ${capitalize(dominant)}`;
  } else {
    if (/churn|leave|cancel/i.test(dominant)) return "Loyal";
    if (/revenue|value|spend/i.test(dominant)) return "Budget Segment";
    return `Low ${capitalize(dominant)}`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function runClustering(
  X: number[][],
  features: string[],
  maxK = 5,
): KMeansResult {
  if (X.length < 6) {
    return {
      k: 1,
      clusters: [],
      points: [],
      silhouette: 0,
      features,
      plainText: "Not enough data rows for clustering (need ≥ 6).",
    };
  }

  const { Xn, means: globalMeans } = normalizeForClustering(X);

  // Try k = 2..maxK, pick best silhouette
  let bestResult: ReturnType<typeof runKMeans> | null = null;
  let bestK = 2;
  let bestSil = -Infinity;

  for (let k = 2; k <= Math.min(maxK, Math.floor(X.length / 3)); k++) {
    const result = runKMeans(Xn, k);
    if (result.silhouette > bestSil) {
      bestSil = result.silhouette;
      bestResult = result;
      bestK = k;
    }
  }

  const { assignments, centroids } = bestResult!;

  // Denormalize centroids back to original scale
  const { Xn: _, means, stds } = normalizeForClustering(X);
  const denormCentroids = centroids.map((c) =>
    c.map((v, d) => v * stds[d] + means[d]),
  );

  const globalFeatureMeans = features.map((_, d) =>
    X.reduce((s, r) => s + r[d], 0) / X.length,
  );

  const clusters: ClusterInfo[] = Array.from({ length: bestK }, (_, k) => {
    const size = assignments.filter((a) => a === k).length;
    const centroid = denormCentroids[k];
    const label = autoLabel(centroid, globalFeatureMeans, features, size, X.length);
    const profile = features.map((f, d) => ({
      feature: f,
      value: centroid[d],
      relativeToMean: globalFeatureMeans[d]
        ? (centroid[d] - globalFeatureMeans[d]) / Math.abs(globalFeatureMeans[d])
        : 0,
    })).sort((a, b) => Math.abs(b.relativeToMean) - Math.abs(a.relativeToMean));

    return {
      id: k,
      label,
      centroid,
      size,
      pct: size / X.length,
      profile,
    };
  });

  const points: ClusterPoint[] = X.map((f, i) => ({
    rowIndex: i,
    cluster: assignments[i],
    features: f,
  }));

  const clusterDescriptions = clusters
    .map((c) => `${c.label} (${(c.pct * 100).toFixed(0)}%)`)
    .join(", ");
  const plainText = `K-means identified ${bestK} natural customer segments: ${clusterDescriptions}. Silhouette score: ${bestSil.toFixed(2)} (higher is better, >0.5 is strong separation).`;

  return {
    k: bestK,
    clusters,
    points,
    silhouette: bestSil,
    features,
    plainText,
  };
}
