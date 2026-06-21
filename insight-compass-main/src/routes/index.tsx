import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Activity, BarChart3, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "InsightForge — Analyze and forecast your business data" },
      {
        name: "description",
        content:
          "Upload a spreadsheet. Get an instant dashboard, plain-language insights, and forecasts for what's coming next.",
      },
      { property: "og:title", content: "InsightForge — Analyze and forecast your business data" },
      {
        property: "og:description",
        content:
          "Upload a spreadsheet. Get an instant dashboard, plain-language insights, and forecasts for what's coming next.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-analysis text-analysis-foreground">
              <Activity className="h-4 w-4" />
            </div>
            InsightForge
          </div>
          <Link to="/auth">
            <Button size="sm" variant="ghost">
              Sign in
            </Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-analysis/40 bg-analysis/10 px-3 py-1 text-xs text-analysis">
            <Sparkles className="h-3 w-3" />
            For founders and analysts
          </span>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Turn a spreadsheet into{" "}
            <span className="text-analysis">decisions</span> and{" "}
            <span className="text-forecast">forecasts</span>.
          </h1>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">
            Drop in your sales, marketing, or product data. InsightForge cleans
            it, finds what changed and why, predicts what's next, and writes the
            summary for you.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/auth">
              <Button size="lg">Get started — it's free</Button>
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-2">
          <Feature
            tone="analysis"
            icon={BarChart3}
            title="Analysis layer"
            caption="What happened & why"
            points={[
              "Auto-detected schema & data quality score",
              "Trends, segmentation, correlations",
              "Plain-language narrative summary",
            ]}
          />
          <Feature
            tone="forecast"
            icon={TrendingUp}
            title="Data science layer"
            caption="What will happen & how to optimize"
            points={[
              "Time-series forecasts with confidence bands",
              "Predictive models with feature importance",
              "What-if simulator and ranked recommendations",
            ]}
          />
        </div>
      </main>
    </div>
  );
}

function Feature({
  tone,
  icon: Icon,
  title,
  caption,
  points,
}: {
  tone: "analysis" | "forecast";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  caption: string;
  points: string[];
}) {
  const accent =
    tone === "analysis"
      ? "bg-analysis text-analysis-foreground"
      : "bg-forecast text-forecast-foreground";
  const border =
    tone === "analysis"
      ? "border-analysis/30 hover:border-analysis/60"
      : "border-forecast/30 hover:border-forecast/60";
  return (
    <div
      className={`rounded-xl border bg-card p-6 transition-colors ${border}`}
    >
      <div className="flex items-center gap-3">
        <div className={`grid h-9 w-9 place-items-center rounded-md ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="text-foreground/40">→</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
