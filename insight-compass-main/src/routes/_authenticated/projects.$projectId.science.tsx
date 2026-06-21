import { createFileRoute, Link, notFound, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/insightforge/AppHeader";
import { ScienceDashboard } from "@/components/insightforge/ScienceDashboard";
import { Badge } from "@/components/ui/badge";
import { analyzeDataset } from "@/lib/insightforge/analyze";
import type { ColumnSchema, DataRow, QualityReport } from "@/lib/insightforge/types";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/projects/$projectId/science")({
  head: () => ({
    meta: [
      { title: "Data Science — InsightForge" },
      {
        name: "description",
        content: "Forecasting, predictive modeling, clustering, and what-if simulation.",
      },
    ],
  }),
  component: SciencePage,
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

function SciencePage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/science",
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

  const analysis = useMemo(() => {
    if (!dataset) return null;
    return analyzeDataset(dataset.rows, dataset.inferred_schema, {
      dateColumn: dataset.date_column,
      targetColumn: dataset.target_column,
    });
  }, [dataset]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          to="/projects/$projectId/analysis"
          params={{ projectId }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to analysis
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project?.name ?? "Data Science"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Predictive models, forecasts, and what-if simulations.
            </p>
          </div>
          <Badge variant="outline" className="border-forecast/40 bg-forecast/10 text-forecast">
            <TrendingUp className="mr-1 h-3 w-3" />
            Science layer
          </Badge>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading dataset…</p>
          ) : !dataset || !analysis ? (
            <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
              No dataset uploaded yet.{" "}
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="text-analysis underline"
              >
                Upload one
              </Link>{" "}
              to enable data science features.
            </div>
          ) : (
            <ScienceDashboard
              rows={dataset.rows}
              schema={dataset.inferred_schema}
              dateColumn={dataset.date_column}
              targetColumn={dataset.target_column}
              analysis={analysis}
              projectName={project?.name ?? "Project"}
              isAdvanced={project?.mode === "advanced"}
            />
          )}
        </div>
      </main>
    </div>
  );
}
