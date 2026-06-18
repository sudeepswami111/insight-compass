import {
  createFileRoute,
  Link,
  notFound,
  useParams,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/insightforge/AppHeader";
import { FileUploader } from "@/components/insightforge/FileUploader";
import { SchemaTable } from "@/components/insightforge/SchemaTable";
import { PreviewTable } from "@/components/insightforge/PreviewTable";
import { QualityScore } from "@/components/insightforge/QualityScore";
import { CleaningPanel } from "@/components/insightforge/CleaningPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Database,
  RefreshCcw,
  Trash2,
  Sparkles,
} from "lucide-react";
import { parseFile } from "@/lib/insightforge/parse";
import {
  inferSchema,
  guessDateColumn,
  guessTargetColumn,
} from "@/lib/insightforge/infer";
import { computeQuality, applyCleaning } from "@/lib/insightforge/quality";
import type {
  ColumnSchema,
  ColumnType,
  DataRow,
  QualityIssue,
  QualityReport,
} from "@/lib/insightforge/types";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

const asJson = <T,>(v: T) => v as unknown as Json;

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — InsightForge" },
      { name: "description", content: "Upload data and prepare it for analysis." },
    ],
  }),
  component: ProjectDetail,
});

interface DatasetRecord {
  id: string;
  filename: string;
  storage_path: string;
  row_count: number;
  column_count: number;
  inferred_schema: ColumnSchema[];
  target_column: string | null;
  date_column: string | null;
  quality_score: number | null;
  quality_report: QualityReport | null;
  rows: DataRow[];
  cleaned: boolean;
  created_at: string;
}

function ProjectDetail() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId" });
  const qc = useQueryClient();

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, mode, created_at")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: dataset, isLoading: datasetLoading } = useQuery({
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

  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      if (file.size > 50 * 1024 * 1024) {
        throw new Error("File exceeds 50MB limit.");
      }
      const { rows, columns } = await parseFile(file);
      if (rows.length === 0) throw new Error("No rows found in file.");
      const schema = inferSchema(rows, columns);
      const report = computeQuality(rows, schema);
      const dateColumn = guessDateColumn(schema) ?? null;
      const targetColumn = guessTargetColumn(schema) ?? null;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const storage_path = `${user.id}/${projectId}/${Date.now()}-${file.name}`;
      const upload = await supabase.storage
        .from("datasets")
        .upload(storage_path, file, { upsert: false });
      if (upload.error) throw upload.error;

      // remove any previous dataset(s) for this project
      await supabase.from("datasets").delete().eq("project_id", projectId);

      const insert = await supabase
        .from("datasets")
        .insert({
          project_id: projectId,
          user_id: user.id,
          filename: file.name,
          storage_path,
          row_count: rows.length,
          column_count: columns.length,
          inferred_schema: asJson(schema),
          target_column: targetColumn,
          date_column: dateColumn,
          quality_score: report.score,
          quality_report: asJson(report),
          rows: asJson(rows),
          cleaned: false,
        })
        .select()
        .single();
      if (insert.error) throw insert.error;
      qc.invalidateQueries({ queryKey: ["dataset", projectId] });
      toast.success("File uploaded and schema detected.");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setUploading(false);
    }
  }

  const deleteDataset = useMutation({
    mutationFn: async () => {
      if (!dataset) return;
      await supabase.storage.from("datasets").remove([dataset.storage_path]);
      const { error } = await supabase
        .from("datasets")
        .delete()
        .eq("id", dataset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dataset", projectId] });
      toast.success("Dataset removed.");
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          All projects
        </Link>
        {projectLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : !project ? (
          <p className="mt-6 text-sm text-muted-foreground">Project not found.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {project.name}
                </h1>
                {project.description && (
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {project.description}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="font-normal">
                {project.mode === "advanced" ? "Advanced mode" : "Simple mode"}
              </Badge>
            </div>

            <div className="mt-8">
              {datasetLoading ? (
                <p className="text-sm text-muted-foreground">Loading dataset…</p>
              ) : !dataset ? (
                <FileUploader onFile={handleUpload} busy={uploading} />
              ) : (
                <DatasetWorkspace
                  dataset={dataset}
                  onDelete={() => deleteDataset.mutate()}
                  onReupload={handleUpload}
                  uploading={uploading}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function DatasetWorkspace({
  dataset,
  onDelete,
  onReupload,
  uploading,
}: {
  dataset: DatasetRecord;
  onDelete: () => void;
  onReupload: (file: File) => void | Promise<void>;
  uploading: boolean;
}) {
  const qc = useQueryClient();
  const [schema, setSchema] = useState<ColumnSchema[]>(dataset.inferred_schema);
  const [rows, setRows] = useState<DataRow[]>(dataset.rows);
  const [targetColumn, setTargetColumn] = useState<string | null>(
    dataset.target_column,
  );
  const [dateColumn, setDateColumn] = useState<string | null>(
    dataset.date_column,
  );
  const [reuploadOpen, setReuploadOpen] = useState(false);

  const report = useMemo(() => computeQuality(rows, schema), [rows, schema]);
  const columns = schema.map((c) => c.name);

  function setType(col: string, t: ColumnType) {
    setSchema((s) =>
      s.map((c) =>
        c.name === col ? { ...c, overrideType: t, inferredType: t } : c,
      ),
    );
  }

  const persist = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("datasets")
        .update({
          inferred_schema: asJson(schema),
          rows: asJson(rows),
          target_column: targetColumn,
          date_column: dateColumn,
          quality_score: report.score,
          quality_report: asJson(report),
          row_count: rows.length,
          column_count: schema.length,
        })
        .eq("id", dataset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dataset", dataset.id] });
      toast.success("Saved.");
    },
    onError: (e) =>
      toast.error("Save failed", {
        description: e instanceof Error ? e.message : "Unknown",
      }),
  });

  const applyFixes = useMutation({
    mutationFn: async (selected: QualityIssue[]) => {
      const actions = selected.map((s) => s.action);
      const result = applyCleaning(rows, schema, actions);
      setRows(result.rows);
      setSchema(result.schema);
      const newReport = computeQuality(result.rows, result.schema);
      const { error } = await supabase
        .from("datasets")
        .update({
          rows: asJson(result.rows),
          inferred_schema: asJson(result.schema),
          row_count: result.rows.length,
          column_count: result.schema.length,
          quality_score: newReport.score,
          quality_report: asJson(newReport),
          cleaned: true,
        })
        .eq("id", dataset.id);
      if (error) throw error;
      return result.changesLog;
    },
    onSuccess: (changes) => {
      toast.success("Cleaning applied.", {
        description: changes.join(" "),
      });
    },
    onError: (e) =>
      toast.error("Couldn't apply fixes", {
        description: e instanceof Error ? e.message : "Unknown",
      }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Database className="h-4 w-4 text-analysis" />
            <span className="font-medium">{dataset.filename}</span>
            <span className="text-muted-foreground">
              · {rows.length.toLocaleString()} rows · {schema.length} columns
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => persist.mutate(undefined)}
              disabled={persist.isPending}
            >
              Save changes
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                className="sr-only"
                accept=".csv,.tsv,.xlsx,.xls,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onReupload(f);
                }}
                disabled={uploading}
              />
              <span className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-accent">
                <RefreshCcw className="h-3.5 w-3.5" />
                Replace
              </span>
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            Detected columns
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Tap a type to change it. Mark one date column and one target column
            to enable trend charts and forecasting.
          </p>
          <SchemaTable
            schema={schema}
            onTypeChange={setType}
            targetColumn={targetColumn}
            onTargetChange={setTargetColumn}
            dateColumn={dateColumn}
            onDateChange={setDateColumn}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            Data preview
          </h2>
          <PreviewTable rows={rows} columns={columns} maxRows={10} />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-tight">
            Cleaning suggestions
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Nothing is changed until you select fixes and click apply.
          </p>
          <CleaningPanel
            issues={report.issues}
            applying={applyFixes.isPending}
            onApply={(selected) => applyFixes.mutate(selected)}
          />
        </section>
      </div>

      <aside className="space-y-4">
        <QualityScore report={report} />
        <Card className="border-analysis/30 bg-analysis/5 p-4">
          <p className="text-xs uppercase tracking-wide text-analysis">
            Next step
          </p>
          <div className="mt-1.5 flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 text-analysis" />
            <p className="text-sm">
              Once you're happy with the data and quality score, the Analysis
              dashboard will generate trends, segments, and a written summary.
            </p>
          </div>
          <Button
            className="mt-3 w-full"
            variant="secondary"
            disabled
            title="Coming in Phase 2"
          >
            Run analysis (coming soon)
          </Button>
        </Card>
        {dataset.cleaned && (
          <Card className="border-success/30 bg-success/5 p-3 text-xs text-success">
            Cleaning applied to this dataset.
          </Card>
        )}
      </aside>
    </div>
  );
}