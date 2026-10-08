import { NextResponse } from "next/server";
import {
  OpenAtlasAPIError,
  OpenAtlasConnectionError,
  OpenAtlasError,
  OpenAtlasTimeoutError,
} from "@openatlas/sdk";
import type { ApiFailure } from "@/lib/shared/contract";
import { getSessionUser } from "./session";
import { rateLimit } from "./rate-limit";
import { hasApiKey, isMock } from "./client";

/** Build a JSON failure response in the shape the client expects. */
export function fail(
  code: string,
  status: number,
  detail?: string,
  headers?: Record<string, string>,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    { ok: false, error: { code, ...(detail ? { detail } : {}) } },
    { status, headers },
  );
}

export function jsonError(code: string, status: number, detail?: string): NextResponse<ApiFailure> {
  return fail(code, status, detail);
}

/**
 * Verify the signed unlock cookie and return the anonymous session id, or a
 * ready-to-send 401. Every /api/* route calls this (or guardModelRoute) itself —
 * the proxy check is only the optimistic outer gate.
 */
export async function requireSession(): Promise<string | NextResponse> {
  const uid = await getSessionUser();
  if (!uid) return fail("unauthorized", 401, "missing or invalid unlock cookie");
  return uid;
}

/**
 * Session + rate limit + configuration check for a model-calling route.
 * Returns the anonymous session id, or a ready-to-send failure response.
 */
export async function guardModelRoute(): Promise<string | NextResponse> {
  const auth = await requireSession();
  if (typeof auth !== "string") return auth;
  const rl = rateLimit(`model:${auth}`);
  if (!rl.ok) return fail("rate_limited", 429, `retry after ${rl.retryAfterSec}s`, { "Retry-After": String(rl.retryAfterSec) });
  if (!isMock() && !hasApiKey()) return fail("not_configured", 503, "OPENATLAS_API_KEY is not set");
  return auth;
}

/**
 * Turn any thrown SDK error into the friendly JSON failure the client shows.
 * Branches on error type and `code`, never on message text (build spec 5.4);
 * details are logged server-side only.
 */
export function mapSdkError(err: unknown): NextResponse<ApiFailure> {
  if (err instanceof OpenAtlasAPIError) {
    console.error(`[demo-api] gateway error code=${err.code} status=${err.status} message=${err.message}${err.jobId ? ` job=${err.jobId}` : ""}`);
    return fail(err.code, err.status || 500, err.message);
  }
  if (err instanceof OpenAtlasTimeoutError || err instanceof OpenAtlasConnectionError) {
    console.error(`[demo-api] ${err.constructor.name}: ${err.message}`);
    return fail("backend_unavailable", 504, err.message);
  }
  if (err instanceof OpenAtlasError) {
    console.error(`[demo-api] argument error: ${err.message}`);
    return fail("bad_request", 400, err.message);
  }
  console.error("[demo-api] unexpected error", err);
  return fail("unknown", 500, err instanceof Error ? err.message : String(err));
}
