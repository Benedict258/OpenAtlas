import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { verifyUnlockToken } from "./unlock-token";

export const SESSION_COOKIE = "oa_session";
export const UNLOCK_COOKIE = "oa_unlock";
export const SESSION_DAYS = 7;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The anonymous per-visitor session id, or null when the unlock cookie is missing,
 * expired or forged. This is the opaque `user` value every model call sends.
 */
export async function getSessionUser(): Promise<string | null> {
  const store = await cookies();
  if (!verifyUnlockToken(store.get(UNLOCK_COOKIE)?.value)) return null;
  const uid = store.get(SESSION_COOKIE)?.value;
  if (!uid || !UUID_RE.test(uid)) return null;
  return uid;
}

export function newSessionUser(): string {
  return randomUUID();
}

/** Cookie attributes shared by both session cookies. */
export function sessionCookieOptions(maxAgeSeconds: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
