import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every navigation so server components
 * always see a valid user, and applies a coarse route guard.
 *
 * The guard is a convenience, not the security boundary: authorization is
 * enforced again in every server action, route handler and RLS policy. Nothing
 * here is trusted by the data layer.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPlatformArea =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  const isBusinessArea = pathname.startsWith("/dashboard");

  if (!user && (isPlatformArea || isBusinessArea)) {
    const url = request.nextUrl.clone();
    url.pathname = isPlatformArea ? "/admin/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/admin/login")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/admin/login" ? "/admin" : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the public API — the public API is
     * anonymous by design and must never be redirected to a login page.
     */
    "/((?!api/v1/public|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
