/**
 * Prescriptive Recommendations Engine.
 * Converts analysis + model results into 3–5 ranked, plain-language actions.
 */

import type { AnalysisResult } from "./analyze";
import type { ModelResult } from "./ml/automl";
import type { KMeansResult } from "./ml/kmeans";
import type { ForecastResult } from "./ml/forecast";

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  estimatedImpact: string; // e.g., "~6% churn reduction"
  confidence: "high" | "medium" | "low";
  category: "analysis" | "forecast" | "model" | "cluster";
  priority: number; // 1 = highest
}

export function generateRecommendations(
  analysis: AnalysisResult,
  model: ModelResult | null,
  forecast: ForecastResult | null,
  clustering: KMeansResult | null,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // ── Model-based recommendations ─────────────────────────────────────────
  if (model && model.featureImportance.length > 0) {
    const top = model.featureImportance[0];
    const isChurn =
      /churn|cancel|leave/i.test(model.targetColumn) ||
      model.task === "binary_classification";

    if (isChurn) {
      recs.push({
        id: "rec-model-1",
        title: `Reduce ${top.feature.replace(/=/g, " = ")} to lower churn`,
        description: `"${top.feature.replace(/=/g, " = ")}" is the single strongest predictor of ${model.targetColumn}. Customers in high-risk ranges of this feature are significantly more likely to churn. Prioritize interventions for this segment.`,
        estimatedImpact: `Up to ${((top.importance * 0.15) * 100).toFixed(0)}% churn reduction`,
        confidence: model.qualityRating === "Excellent" || model.qualityRating === "Good" ? "high" : "medium",
        category: "model",
        priority: 1,
      });

      if (model.featureImportance.length >= 2) {
        const second = model.featureImportance[1];
        recs.push({
          id: "rec-model-2",
          title: `Monitor ${second.feature.replace(/=/g, " = ")} closely`,
          description: `"${second.feature.replace(/=/g, " = ")}" is the second strongest predictor. Setting up alerts when this metric crosses a threshold could give you early warning of at-risk customers.`,
          estimatedImpact: `~${((second.importance * 0.1) * 100).toFixed(0)}% improvement in early detection`,
          confidence: "medium",
          category: "model",
          priority: 2,
        });
      }
    } else {
      // Regression target
      recs.push({
        id: "rec-model-1",
        title: `Optimize ${top.feature.replace(/=/g, " = ")} to improve ${model.targetColumn}`,
        description: `"${top.feature.replace(/=/g, " = ")}" has the strongest influence on ${model.targetColumn} (${(top.importance * 100).toFixed(0)}% of the model's weight). A 10% improvement in this input is predicted to move your outcome meaningfully.`,
        estimatedImpact: `~${((top.importance * 0.12) * 100).toFixed(0)}% improvement in ${model.targetColumn}`,
        confidence: model.qualityRating === "Excellent" ? "high" : "medium",
        category: "model",
        priority: 1,
      });
    }
  }

  // ── Forecast-based recommendations ────────────────────────────────────────
  if (forecast && Math.abs(forecast.points.filter((p) => !p.isHistory).length) > 0) {
    const futurePts = forecast.points.filter((p) => !p.isHistory);
    const forecastEnd = futurePts[futurePts.length - 1]?.forecast ?? 0;
    const histPts = forecast.points.filter((p) => p.isHistory);
    const histLast = histPts[histPts.length - 1]?.value ?? 1;
    const changePct = histLast ? ((forecastEnd - histLast) / Math.abs(histLast)) * 100 : 0;
    const isDecline = changePct < -5;

    if (isDecline) {
      recs.push({
        id: "rec-forecast-1",
        title: `Prepare for forecasted ${forecast.metric} decline`,
        description: `The model projects ${forecast.metric} to drop by ${Math.abs(changePct).toFixed(1)}% over the next ${forecast.horizon} ${forecast.granularity === "day" ? "days" : forecast.granularity === "week" ? "weeks" : "months"}. Proactive measures now (promotions, re-engagement campaigns) can counteract this trend.`,
        estimatedImpact: `Prevent ~${Math.abs(changePct).toFixed(0)}% decline`,
        confidence: forecast.rmse / (histLast || 1) < 0.2 ? "high" : "medium",
        category: "forecast",
        priority: recs.length + 1,
      });
    } else if (changePct > 10) {
      recs.push({
        id: "rec-forecast-2",
        title: `Scale capacity for forecasted ${forecast.metric} growth`,
        description: `${forecast.metric} is projected to grow ${changePct.toFixed(1)}% in the next ${forecast.horizon} periods. Ensure your infrastructure, team, and inventory are ready to handle the increased volume.`,
        estimatedImpact: `Capture ${changePct.toFixed(0)}% growth without bottlenecks`,
        confidence: "medium",
        category: "forecast",
        priority: recs.length + 1,
      });
    }
  }

  // ── Cluster-based recommendations ────────────────────────────────────────
  if (clustering && clustering.clusters.length >= 2) {
    const atRisk = clustering.clusters.find((c) =>
      /risk|dormant|churn/i.test(c.label),
    );
    const highValue = clustering.clusters.find((c) =>
      /high|value|loyal/i.test(c.label),
    );

    if (atRisk) {
      recs.push({
        id: "rec-cluster-1",
        title: `Re-engage "${atRisk.label}" segment (${(atRisk.pct * 100).toFixed(0)}% of customers)`,
        description: `The "${atRisk.label}" cluster (${atRisk.size} customers) shows below-average engagement metrics. A targeted win-back campaign for this group could recover significant revenue.`,
        estimatedImpact: `Potential recovery of ~${(atRisk.pct * 20).toFixed(0)}% of churned revenue`,
        confidence: "medium",
        category: "cluster",
        priority: recs.length + 1,
      });
    }

    if (highValue && highValue !== atRisk) {
      recs.push({
        id: "rec-cluster-2",
        title: `Double down on "${highValue.label}" segment`,
        description: `The "${highValue.label}" cluster (${highValue.size} customers, ${(highValue.pct * 100).toFixed(0)}% of base) drives disproportionate value. Loyalty rewards or dedicated account management for this group can improve retention and LTV.`,
        estimatedImpact: `+${(highValue.pct * 15).toFixed(0)}% LTV from top segment`,
        confidence: "medium",
        category: "cluster",
        priority: recs.length + 1,
      });
    }
  }

  // ── Analysis-based recommendations (fallback) ─────────────────────────
  if (analysis.trends.length > 0) {
    const declining = analysis.trends.filter((t) => t.deltaPct < -0.1);
    if (declining.length > 0) {
      const t = declining[0];
      recs.push({
        id: "rec-trend-1",
        title: `Investigate declining ${t.metric}`,
        description: `${t.metric} fell ${(Math.abs(t.deltaPct) * 100).toFixed(1)}% in the most recent period. ${t.anomalies.length > 0 ? `${t.anomalies.length} anomalous data point${t.anomalies.length > 1 ? "s were" : " was"} detected.` : ""} Dig into the root cause before it compounds.`,
        estimatedImpact: "Prevent further decline",
        confidence: "low",
        category: "analysis",
        priority: recs.length + 1,
      });
    }

    if (analysis.correlation) {
      const strongPairs = analysis.correlation.topPairs.filter(
        (p) => Math.abs(p.r) > 0.6,
      );
      if (strongPairs.length > 0) {
        const p = strongPairs[0];
        recs.push({
          id: "rec-corr-1",
          title: `Leverage strong ${p.a} ↔ ${p.b} relationship`,
          description: `${p.a} and ${p.b} are strongly correlated (r = ${p.r.toFixed(2)}). ${p.r > 0 ? `Increasing ${p.a} is associated with higher ${p.b}.` : `Reducing ${p.a} appears to associate with higher ${p.b}.`} Test this hypothesis with a controlled experiment.`,
          estimatedImpact: "Inform strategic experiments",
          confidence: "low",
          category: "analysis",
          priority: recs.length + 1,
        });
      }
    }
  }

  // Sort by priority, cap at 5
  return recs
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map((r, i) => ({ ...r, priority: i + 1 }));
}
