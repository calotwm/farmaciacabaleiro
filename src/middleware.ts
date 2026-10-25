import { type NextRequest, NextResponse } from "next/server";

// Keep in sync with SESSION_COOKIE_NAME in src/modules/auth/domain/session-policy.ts
// (not imported: middleware runs on the edge runtime and must stay dependency-free).
const SESSION_COOKIE = "fc_session";
const PUBLIC_PATHS = ["/login", "/recuperar", "/restablecer"];

/**
 * Cheap gate: redirects when no session cookie is present. It does NOT validate the
 * session; real validation happens server-side (getCurrentUser / requireUser / requirePermission).
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|js|css|map|txt|webmanifest)$).*)"],
};
