import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Auth guard disabled for testing
    // const { data, error } = await supabase.auth.getUser();
    // if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: { id: "test-user-id", email: "test@example.com" } };
  },
  component: () => <Outlet />,
});