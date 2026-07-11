import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client, scoped to the current request's cookies.
 * Use this in Route Handlers and Server Components to read the logged-in
 * user's session (via getUser()) — NOT for querying invoice data, which
 * goes through Prisma. This client is for AUTH only.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component in some cases,
            // where cookies can't be mutated. Safe to ignore if you
            // have middleware refreshing sessions (see middleware.js).
          }
        },
      },
    }
  );
}
