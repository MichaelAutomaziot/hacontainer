import { NextResponse, type NextRequest } from "next/server";

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

const PUBLIC_API_ROUTES = [
  "/api/auth",
  "/api/health",
  "/api/public",
  // Service-role-only remediation pipeline. The route handlers themselves
  // run with the service-role Supabase client and do not expose any user
  // data; gating them at the cookie layer is unnecessary friction for
  // server-to-server calls (CLI / cron / dashboard fetches).
  "/api/sync/superpharm/remediate",
  "/api/sync/superpharm/products/push",
  "/api/sync/superpharm/check",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Edge middleware. Goal: gate protected routes behind "user has a Supabase
 * auth cookie". We do NOT call any Supabase SDK method here — that would
 * trigger a token-refresh HTTP call to GoTrue on every request and quickly
 * burn the auth rate limit.
 *
 * Token validity is enforced inside the app (Refine's authProvider.check),
 * which runs once per session, not per request.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname) || isPublicApiRoute(pathname)) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  // Cheap cookie sniff — Supabase's @supabase/ssr writes cookies named
  // `sb-<project-ref>-auth-token`, and when the token is large it gets
  // split into chunks suffixed `.0`, `.1`, etc. Match any of those.
  const hasAuthCookie = request.cookies.getAll().some((c) => {
    const name = c.name;
    return (
      (name.startsWith("sb-") && name.includes("-auth-token")) ||
      name === "sb-access-token" ||
      name === "supabase-auth-token"
    );
  });

  if (!hasAuthCookie) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next({ request: { headers: request.headers } });
}
