export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar.js";

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
