import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function AppHeader() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          to="/projects"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <div className="grid h-7 w-7 place-items-center rounded-md bg-analysis text-analysis-foreground">
            <Activity className="h-4 w-4" />
          </div>
          InsightForge
        </Link>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}