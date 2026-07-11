import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Refreshes the Supabase auth session cookie on every request, and
 * redirects unauthenticated users away from protected pages. Without
 * this, sessions can silently expire mid-use.
 */
export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isApiRoute = request.nextUrl.pathname.startsWith("/api");

  // API routes handle their own 401 response (see route.js) so a
  // fetch() call gets JSON back instead of an HTML redirect. Only
  // redirect actual page navigations here.
  if (!user && !isLoginPage && !isApiRoute) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Already signed in and sitting on /login -> bounce to the dashboard.
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // Apply to everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
