import { DEFAULT_BASE_URL } from "@openatlas/sdk";
import { requireSession } from "@/lib/server/api";
import { isMock } from "@/lib/server/client";

export const dynamic = "force-dynamic";

interface CacheEntry {
  at: number;
  body: { ok: true; reachable: boolean | null; mock: boolean };
}

let cache: CacheEntry | null = null;
const TTL_MS = 20_000;

export async function GET() {
  const auth = await requireSession();
  if (typeof auth !== "string") return auth;

  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return Response.json(cache.body);

  const base = process.env.OPENATLAS_BASE_URL || DEFAULT_BASE_URL;
  let reachable: boolean | null = null;
  let mockFromHealth = false;

  if (base) {
    try {
      const res = await fetch(new URL("/v1/health", base), {
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          status?: string;
          backend?: { reachable?: boolean; mock?: boolean };
        };
        mockFromHealth = data.backend?.mock === true;
        reachable = typeof data.backend?.reachable === "boolean" ? data.backend.reachable : null;
      } else {
        reachable = false;
      }
    } catch {
      reachable = false;
    }
  }

  // The app is in mock mode when DEMO_MOCK is set locally or the gateway's own
  // backend reports mock — either way the dot must not claim a live model server.
  const mock = isMock() || mockFromHealth;
  const body = { ok: true as const, reachable, mock };
  cache = { at: now, body };
  return Response.json(body);
}
