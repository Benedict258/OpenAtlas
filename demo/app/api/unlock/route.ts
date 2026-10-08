import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { fail } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import {
  SESSION_COOKIE,
  UNLOCK_COOKIE,
  SESSION_DAYS,
  newSessionUser,
  sessionCookieOptions,
} from "@/lib/server/session";
import { signUnlockToken } from "@/lib/server/unlock-token";

export const dynamic = "force-dynamic";

function passcodeMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`unlock:${ip}`, 15, 10 * 60 * 1000);
  if (!rl.ok) {
    return fail("rate_limited", 429, `retry after ${rl.retryAfterSec}s`, {
      "Retry-After": String(rl.retryAfterSec),
    });
  }

  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return fail("not_configured", 503, "DEMO_PASSCODE is not set");

  const body: unknown = await request.json().catch(() => null);
  const passcode =
    body && typeof body === "object" && typeof (body as { passcode?: unknown }).passcode === "string"
      ? (body as { passcode: string }).passcode
      : "";
  if (!passcode || !passcodeMatches(passcode, expected)) {
    return fail("invalid_passcode", 403, "wrong passcode");
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) return fail("not_configured", 503, "SESSION_SECRET is not set");

  const store = await cookies();
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const token = signUnlockToken(Date.now() + maxAge * 1000);
  if (!token) return fail("not_configured", 503, "SESSION_SECRET is not set");

  // Keep the same anonymous id across re-unlocks when one already exists.
  const existing = store.get(SESSION_COOKIE)?.value;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Secure on HTTPS hosts (the deployed app); plain HTTP only for local `next start`.
  const https =
    request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";
  const opts = sessionCookieOptions(maxAge, https);
  store.set(SESSION_COOKIE, existing && uuidRe.test(existing) ? existing : newSessionUser(), opts);
  store.set(UNLOCK_COOKIE, token, opts);

  return Response.json({ ok: true });
}
