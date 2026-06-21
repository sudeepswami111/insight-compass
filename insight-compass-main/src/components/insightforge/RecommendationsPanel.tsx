import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  TrendingUp,
  BarChart3,
  Users,
  Activity,
  Award,
  ChevronRight,
} from "lucide-react";
import type { Recommendation } from "@/lib/insightforge/recommendations";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  model: <BarChart3 className="h-4 w-4" />,
  forecast: <TrendingUp className="h-4 w-4" />,
  cluster: <Users className="h-4 w-4" />,
  analysis: <Activity className="h-4 w-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  model: "border-forecast/40 bg-forecast/5",
  forecast: "border-forecast/40 bg-forecast/5",
  cluster: "border-analysis/40 bg-analysis/5",
  analysis: "border-border/60 bg-card",
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "bg-success/20 text-success border-success/30",
  medium: "bg-forecast/20 text-forecast border-forecast/30",
  low: "bg-muted/40 text-muted-foreground border-border",
};

interface Props {
  recommendations: Recommendation[];
}

export function RecommendationsPanel({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center border-dashed border-border/60 bg-card/50 px-6 py-14 text-center">
        <Award className="h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">No recommendations yet</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Mark a target column and run forecasting to generate data-driven action items.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Recommended Actions</h2>
        <p className="text-xs text-muted-foreground">
          {recommendations.length} data-driven action item{recommendations.length > 1 ? "s" : ""}, ranked by estimated impact.
        </p>
      </div>

      {recommendations.map((rec) => (
        <Card
          key={rec.id}
          className={`border p-5 transition-colors ${CATEGORY_COLORS[rec.category] ?? ""}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
              {CATEGORY_ICONS[rec.category] ?? <Award className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forecast/20 text-[10px] font-bold text-forecast">
                    {rec.priority}
                  </span>
                  <h3 className="text-sm font-semibold leading-snug">{rec.title}</h3>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase tracking-wide ${CONFIDENCE_BADGE[rec.confidence] ?? ""}`}
                >
                  {rec.confidence} confidence
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {rec.description}
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-forecast">
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium">Estimated impact: {rec.estimatedImpact}</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
