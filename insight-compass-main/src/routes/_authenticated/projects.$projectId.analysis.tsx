import { createFileRoute, Link, notFound, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, TrendingUp, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/insightforge/AppHeader";
import { AnalysisDashboard } from "@/components/insightforge/AnalysisDashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyzeDataset } from "@/lib/insightforge/analyze";
import { generateRecommendations } from "@/lib/insightforge/recommendations";
import { generatePDFReport } from "@/lib/insightforge/pdfReport";
import { toast } from "sonner";
import type { ColumnSchema, DataRow, QualityReport } from "@/lib/insightforge/types";

export const Route = createFileRoute("/_authenticated/projects/$projectId/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis — InsightForge" },
      {
        name: "description",
        content: "Descriptive analysis, trends, segments, and correlations.",
      },
    ],
  }),
  component: AnalysisPage,
});

interface DatasetRecord {
  id: string;
  filename: string;
  row_count: number;
  column_count: number;
  inferred_schema: ColumnSchema[];
  target_column: string | null;
  date_column: string | null;
  quality_score: number | null;
  quality_report: QualityReport | null;
  rows: DataRow[];
}

function AnalysisPage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/analysis",
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, mode")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: dataset, isLoading } = useQuery({
    queryKey: ["dataset", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("datasets")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as DatasetRecord | null;
    },
  });

  const [pdfLoading, setPdfLoading] = useState(false);

  const analysis = useMemo(() => {
    if (!dataset) return null;
    return analyzeDataset(dataset.rows, dataset.inferred_schema, {
      dateColumn: dataset.date_column,
      targetColumn: dataset.target_column,
    });
  }, [dataset]);

  async function handleExportPDF() {
    if (!dataset || !analysis || !project) return;
    setPdfLoading(true);
    try {
      const recs = generateRecommendations(analysis, null, null, null);
      const { data: narrativeRow } = await supabase
        .from("analyses")
        .select("narrative")
        .eq("dataset_id", dataset.id)
        .eq("kind", "narrative")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await generatePDFReport({
        projectName: project.name,
        narrative: narrativeRow?.narrative ?? null,
        analysis,
        model: null,
        forecast: null,
        clustering: null,
        recommendations: recs,
      });
      toast.success("PDF report downloaded.");
    } catch (err) {
      toast.error("PDF generation failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to data
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project?.name ?? "Analysis"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Descriptive analysis — what's in the data right now.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-analysis/40 bg-analysis/10 text-analysis">
              Analysis layer
            </Badge>
            {dataset && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportPDF}
                  disabled={pdfLoading}
                  className="gap-1.5"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  {pdfLoading ? "Generating…" : "Export PDF"}
                </Button>
                <Link
                  to="/projects/$projectId/science"
                  params={{ projectId }}
                >
                  <Button size="sm" className="gap-1.5 bg-forecast text-forecast-foreground hover:bg-forecast/90">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Data Science →
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading dataset…</p>
          ) : !dataset ? (
            <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
              No dataset uploaded yet.{" "}
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="text-analysis underline"
              >
                Upload one
              </Link>{" "}
              to enable analysis.
            </div>
          ) : (
            <AnalysisDashboard
              datasetId={dataset.id}
              rows={dataset.rows}
              schema={dataset.inferred_schema}
              dateColumn={dataset.date_column}
              targetColumn={dataset.target_column}
            />
          )}
        </div>
      </main>
    </div>
  );
}