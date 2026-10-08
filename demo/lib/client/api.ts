import { friendlyError } from "@/lib/shared/contract";

export class DemoApiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/**
 * POST JSON to one of the demo's /api/* routes. Throws DemoApiError carrying the
 * server's machine-readable code; never throws raw server messages at the UI.
 */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let data: unknown = null;
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    data = await res.json().catch(() => null);
  } catch {
    throw new DemoApiError("unknown");
  }
  const failure = !res.ok || !data || typeof data !== "object" || (data as { ok?: boolean }).ok !== true;
  if (failure) {
    const code =
      data && typeof data === "object"
        ? (data as { error?: { code?: unknown } }).error?.code
        : undefined;
    throw new DemoApiError(typeof code === "string" && code ? code : "unknown");
  }
  return data as T;
}

/** POST FormData (audio uploads) — same error contract as postJson. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  let data: unknown = null;
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", body: form });
    data = await res.json().catch(() => null);
  } catch {
    throw new DemoApiError("unknown");
  }
  const failure = !res.ok || !data || typeof data !== "object" || (data as { ok?: boolean }).ok !== true;
  if (failure) {
    const code =
      data && typeof data === "object"
        ? (data as { error?: { code?: unknown } }).error?.code
        : undefined;
    throw new DemoApiError(typeof code === "string" && code ? code : "unknown");
  }
  return data as T;
}

export { friendlyError };
