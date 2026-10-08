/**
 * Best-effort in-memory sliding-window rate limiter for the demo app's model
 * routes (30 calls per 10 minutes per session, per the build spec). On serverless
 * this only covers one instance; the gateway key's daily limit is the real
 * backstop.
 */

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 30;

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit = LIMIT, windowMs = WINDOW_MS): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, hits] of buckets) {
      if (hits.length === 0 || hits[hits.length - 1] < now - windowMs) buckets.delete(k);
    }
  }
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) {
    const retryAfterMs = hits[0] + windowMs - now;
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSec: 0 };
}
