import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/insightforge/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderPlus, Loader2, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — InsightForge" },
      { name: "description", content: "Your data analysis projects." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, mode, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: name.trim(),
          description: description.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setName("");
      setDescription("");
      router.navigate({
        to: "/projects/$projectId",
        params: { projectId: p.id },
      });
    },
    onError: (e) =>
      toast.error("Couldn't create project", {
        description: e instanceof Error ? e.message : "Unknown error",
      }),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each project holds one dataset and its analysis.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <FolderPlus className="h-4 w-4" />
                New project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a project</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!name.trim()) return;
                  create.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">Name</Label>
                  <Input
                    id="p-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Q3 Sales Analysis"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-desc">Description (optional)</Label>
                  <Textarea
                    id="p-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What are you trying to learn from this data?"
                    rows={3}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={create.isPending || !name.trim()}
                  className="w-full"
                >
                  {create.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Create project
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading projects…</p>
          ) : !projects || projects.length === 0 ? (
            <EmptyState onCreate={() => setOpen(true)} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="group"
                >
                  <Card className="h-full border-border/60 bg-card p-5 transition-colors hover:border-analysis/60">
                    <div className="flex items-start justify-between">
                      <h3 className="font-medium tracking-tight">{p.name}</h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-analysis" />
                    </div>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {p.description}
                      </p>
                    )}
                    <p className="mt-4 text-xs text-muted-foreground">
                      Updated {formatDistanceToNow(new Date(p.updated_at))} ago
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center border-dashed border-border/70 bg-card/50 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold tracking-tight">No projects yet</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Create your first project to upload a CSV or Excel file. InsightForge
        will detect the columns, score data quality, and prepare it for
        analysis.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <FolderPlus className="h-4 w-4" />
        Create your first project
      </Button>
    </Card>
  );
}