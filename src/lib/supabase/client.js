import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client, used by the login page to call
 * supabase.auth.signInWithPassword(). This client is for AUTH only —
 * invoice data still goes through /api/invoices (Prisma).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
