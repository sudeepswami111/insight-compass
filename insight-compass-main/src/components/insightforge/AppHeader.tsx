import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, LogOut, FolderOpen, BarChart3, TrendingUp, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function AppHeader() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const navLinks = [
    { to: "/projects", label: "Projects", icon: <FolderOpen className="h-3.5 w-3.5" /> },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link
            to="/projects"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <div className="grid h-7 w-7 place-items-center rounded-md bg-analysis text-analysis-foreground">
              <Activity className="h-4 w-4" />
            </div>
            <span className="hidden sm:inline">InsightForge</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-0.5 sm:flex">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                  currentPath.startsWith(link.to)
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={signOut} className="hidden sm:flex">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="border-t border-border/60 bg-background px-4 py-3 sm:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
            <button
              onClick={() => { setMobileOpen(false); signOut(); }}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}