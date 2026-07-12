import { createSupabaseServerClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";

/**
 * Layout for all protected/dashboard routes ("/", "/invoices", "/profile").
 *
 * This does NOT do the auth redirect itself — src/middleware.js already
 * blocks unauthenticated requests before they ever reach this layout, so
 * by the time this runs, `user` is expected to be non-null. Fetching it
 * again here (server-side, before any HTML streams) is just to pass real
 * user data down to the Navbar — it costs nothing extra in flash/flicker
 * because it happens before the response is sent, not after hydration.
 */
export default async function DashboardLayout({ children }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar user={user} />
      {children}
    </div>
  );
}
