import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The unlock cookie's value: "<expiryMs>.<hmac>". Signed with SESSION_SECRET so it
 * cannot be forged. Pure functions on purpose: this module is imported by proxy.ts
 * (Node runtime) and by the route handlers, and touches nothing request-specific.
 */

const ENC = "utf8";

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length > 0 ? s : null;
}

export function signUnlockToken(expiryMs: number): string | null {
  const s = secret();
  if (!s) return null;
  const payload = String(expiryMs);
  const sig = createHmac("sha256", s).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUnlockToken(value: string | undefined | null): boolean {
  const s = secret();
  if (!s || !value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = createHmac("sha256", s).update(payload).digest("base64url");
  const a = Buffer.from(sig, ENC);
  const b = Buffer.from(expected, ENC);
  return a.length === b.length && timingSafeEqual(a, b);
}
