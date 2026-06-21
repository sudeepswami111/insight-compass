/**
 * PDF Report generator using jsPDF.
 * Captures key stats, narrative, feature importance, and recommendations.
 */

import type { AnalysisResult } from "./analyze";
import type { ModelResult } from "./ml/automl";
import type { ForecastResult } from "./ml/forecast";
import type { KMeansResult } from "./ml/kmeans";
import type { Recommendation } from "./recommendations";
import { formatNumber } from "./analyze";

// jsPDF is loaded lazily to avoid bundling issues
async function getJsPDF() {
  const { jsPDF } = await import("jspdf");
  return jsPDF;
}

type RGB = [number, number, number];

const TEAL: RGB = [15, 188, 188];
const AMBER: RGB = [245, 158, 11];
const WHITE: RGB = [255, 255, 255];
const DARK: RGB = [20, 25, 38];
const GRAY: RGB = [120, 130, 150];
const LIGHT_GRAY: RGB = [240, 243, 248];
const GREEN: RGB = [34, 197, 94];
const MID_GRAY: RGB = [156, 163, 175];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setFill(doc: any, rgb: RGB) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setTextCol(doc: any, rgb: RGB) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setDrawCol(doc: any, rgb: RGB) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

export async function generatePDFReport(opts: {
  projectName: string;
  narrative: string | null;
  analysis: AnalysisResult;
  model: ModelResult | null;
  forecast: ForecastResult | null;
  clustering: KMeansResult | null;
  recommendations: Recommendation[];
}): Promise<void> {
  const JsPDF = await getJsPDF();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 16;
  const contentW = W - margin * 2;
  let y = 0;

  function checkPageBreak(neededHeight: number) {
    if (y + neededHeight > 270) {
      doc.addPage();
      y = margin;
    }
  }

  function drawHeader() {
    setFill(doc, DARK);
    doc.rect(0, 0, W, 18, "F");
    setTextCol(doc, TEAL);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("InsightForge", margin, 11);
    setTextCol(doc, WHITE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Report: ${opts.projectName}`, W - margin, 11, { align: "right" });
    y = 24;
  }

  function sectionTitle(title: string, color: RGB = TEAL) {
    checkPageBreak(12);
    setTextCol(doc, color);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), margin, y);
    setDrawCol(doc, color);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 1.5, margin + contentW, y + 1.5);
    y += 8;
  }

  function paragraph(text: string, size = 9) {
    const lines = doc.splitTextToSize(text, contentW);
    checkPageBreak(lines.length * (size * 0.4) + 4);
    setTextCol(doc, DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.4) + 4;
  }

  function statPill(label: string, value: string, x: number, pillY: number, w: number) {
    setFill(doc, LIGHT_GRAY);
    doc.roundedRect(x, pillY, w, 10, 2, 2, "F");
    setTextCol(doc, GRAY);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(label.toUpperCase(), x + w / 2, pillY + 4, { align: "center" });
    setTextCol(doc, DARK);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(value, x + w / 2, pillY + 8.5, { align: "center" });
  }

  // ── Cover / Header ──────────────────────────────────────────────────────
  drawHeader();

  setTextCol(doc, DARK);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(opts.projectName, margin, y + 4);
  y += 10;

  setTextCol(doc, GRAY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(
    `Generated ${dateStr} · ${opts.analysis.rowCount.toLocaleString()} rows · ${opts.analysis.columnCount} columns`,
    margin,
    y,
  );
  y += 10;

  // ── Narrative ────────────────────────────────────────────────────────────
  if (opts.narrative) {
    sectionTitle("Executive Summary");
    paragraph(opts.narrative);
  }

  // ── Headline Stats ───────────────────────────────────────────────────────
  if (opts.analysis.descriptive.length > 0) {
    sectionTitle("Key Metrics");
    const stats = opts.analysis.descriptive.slice(0, 4);
    const pillW = (contentW - 6) / stats.length;
    checkPageBreak(14);
    stats.forEach((s, i) => {
      statPill(s.column, formatNumber(s.mean, { compact: true }), margin + i * (pillW + 2), y, pillW);
    });
    y += 14;
  }

  // ── Top Trends ──────────────────────────────────────────────────────────
  if (opts.analysis.trends.length > 0) {
    sectionTitle("Trend Highlights");
    for (const t of opts.analysis.trends.slice(0, 2)) {
      checkPageBreak(8);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      setTextCol(doc, DARK);
      doc.text(`${t.metric}`, margin, y);
      doc.setFont("helvetica", "normal");
      setTextCol(doc, GRAY);
      const delta = t.deltaPct >= 0 ? `+${(t.deltaPct * 100).toFixed(1)}%` : `${(t.deltaPct * 100).toFixed(1)}%`;
      doc.text(
        ` ${delta} vs prior period · ${t.anomalies.length} anomal${t.anomalies.length === 1 ? "y" : "ies"}`,
        margin + 30,
        y,
      );
      y += 6;
    }
    y += 2;
  }

  // ── Model Results ─────────────────────────────────────────────────────────
  if (opts.model) {
    sectionTitle("Predictive Model", AMBER);
    checkPageBreak(12);
    doc.setFontSize(9);
    setTextCol(doc, DARK);
    doc.setFont("helvetica", "bold");
    doc.text(`Algorithm: `, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(opts.model.algorithm, margin + 22, y);
    doc.setFont("helvetica", "bold");
    doc.text(`Target: `, margin + 90, y);
    doc.setFont("helvetica", "normal");
    doc.text(opts.model.targetColumn, margin + 105, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    setTextCol(doc, GRAY);
    paragraph(opts.model.qualityExplanation);

    // Feature importance table
    if (opts.model.featureImportance.length > 0) {
      checkPageBreak(8);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      setTextCol(doc, DARK);
      doc.text("Top Feature Importances", margin, y);
      y += 5;
      for (const fi of opts.model.featureImportance.slice(0, 5)) {
        checkPageBreak(6);
        const barW = fi.importance * (contentW - 40);
        setFill(doc, AMBER);
        doc.rect(margin + 35, y - 3.5, Math.max(1, barW), 4, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        setTextCol(doc, DARK);
        doc.text(fi.feature.slice(0, 28), margin, y);
        setTextCol(doc, GRAY);
        doc.text(`${(fi.importance * 100).toFixed(0)}%`, W - margin, y, { align: "right" });
        y += 6;
      }
    }
    y += 2;
  }

  // ── Forecast ─────────────────────────────────────────────────────────────
  if (opts.forecast) {
    sectionTitle("Forecast", AMBER);
    paragraph(opts.forecast.plainText);
  }

  // ── Clustering ─────────────────────────────────────────────────────────────
  if (opts.clustering && opts.clustering.clusters.length > 0) {
    sectionTitle("Customer Segments");
    paragraph(opts.clustering.plainText);
    for (const c of opts.clustering.clusters) {
      checkPageBreak(7);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      setTextCol(doc, TEAL);
      doc.text(`• ${c.label}`, margin, y);
      doc.setFont("helvetica", "normal");
      setTextCol(doc, GRAY);
      doc.text(` — ${c.size} customers (${(c.pct * 100).toFixed(0)}%)`, margin + 25, y);
      y += 6;
    }
    y += 2;
  }

  // ── Recommendations ───────────────────────────────────────────────────────
  if (opts.recommendations.length > 0) {
    sectionTitle("Recommended Actions");
    for (const rec of opts.recommendations) {
      checkPageBreak(18);
      const confColor: RGB =
        rec.confidence === "high" ? GREEN :
        rec.confidence === "medium" ? AMBER :
        MID_GRAY;
      setFill(doc, LIGHT_GRAY);
      doc.roundedRect(margin, y - 1, contentW, 14, 2, 2, "F");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      setTextCol(doc, DARK);
      doc.text(`${rec.priority}. ${rec.title}`, margin + 2, y + 4);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      setTextCol(doc, GRAY);
      doc.text(`Impact: ${rec.estimatedImpact}`, margin + 2, y + 10);
      setTextCol(doc, confColor);
      doc.text(`${rec.confidence.toUpperCase()} CONFIDENCE`, W - margin - 2, y + 4, { align: "right" });
      y += 18;
    }
  }

  // ── Footer on all pages ──────────────────────────────────────────────────
  const totalPages = (doc as any).internal.pages.length - 1;
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setTextCol(doc, GRAY);
    doc.text(
      `InsightForge · ${opts.projectName} · Page ${pg} of ${totalPages}`,
      W / 2,
      290,
      { align: "center" },
    );
  }

  doc.save(`insightforge-${opts.projectName.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
