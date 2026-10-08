import { NextResponse, type NextRequest } from "next/server";
import { verifyUnlockToken } from "./lib/server/unlock-token";

/** Paths that work without an unlock cookie. */
const OPEN_PATHS = new Set(["/unlock", "/api/unlock"]);

/**
 * Optimistic passcode gate: redirects page requests to /unlock and rejects /api/*
 * with 401 when the signed unlock cookie is missing, expired or forged.
 * Route handlers re-check the session themselves before doing any work.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (OPEN_PATHS.has(pathname)) return NextResponse.next();
  if (verifyUnlockToken(request.cookies.get("oa_unlock")?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", detail: "missing or invalid unlock cookie" } },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
