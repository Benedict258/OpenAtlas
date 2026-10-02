// OpenAtlas gateway: one public URL + OpenAtlas keys in front of a swappable GPU backend.
//
// - Verifies OpenAtlas keys (stored as SHA-256 hashes in D1).
// - Counts distinct active users over a rolling window and refuses NEW users at the
//   N-ATLaS license cap, so compliance is measured rather than assumed.
// - Stores reportIssue() submissions in the same D1 database.
// - Proxies to whichever backend the config names, holding its credential:
//     BACKEND_KIND=http    any host serving the backend contract (deploy/server/natlas_server.py):
//                          Colab (interim) or NiHub. Set BACKEND_URL + BACKEND_API_KEY.
//     BACKEND_KIND=runpod  RunPod Serverless (fallback): RUNPOD_API_KEY + LLM/ASR endpoint IDs.
//   Switching hosts is `wrangler secret put` (deploy/set-backend.mjs), not a code change.

export interface Env {
  DB: D1Database;
  BACKEND_KIND: string;
  BACKEND_URL: string;
  BACKEND_API_KEY: string;
  RUNPOD_API_KEY: string;
  LLM_ENDPOINT_ID: string;
  ASR_ENDPOINT_ID: string;
  RUNPOD_API_BASE: string;
  ADMIN_TOKEN: string;
  ACTIVE_USER_CAP: string;
  ACTIVE_WINDOW_DAYS: string;
  UPSTREAM_TIMEOUT_MS: string;
}

const CHAT_LANGUAGE_NAMES: Record<string, string> = { en: "English", ha: "Hausa", yo: "Yoruba", ig: "Igbo" };
const ASR_LANGUAGES = new Set(["en-ng", "ha", "yo", "ig"]);
// RunPod rejects /run payloads over 10 MB; base64 adds ~33%.
const MAX_AUDIO_BASE64_CHARS = 9_500_000;
// Free-plan Workers allow 50 subrequests per request; keep polling well under that.
const MAX_POLLS = 40;
// reportIssue() limits. D1 rows max out at 2 MB.
const MAX_ISSUE_TEXT = 8_000;
const MAX_ISSUE_AUDIO_BASE64 = 1_400_000;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly jobId?: string) {
    super(message);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const errorResponse = (e: HttpError) =>
  json(e.status, { error: { code: e.code, message: e.message, ...(e.jobId ? { job_id: e.jobId } : {}) } });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "");
  return m ? m[1].trim() : null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireAdmin(req: Request, env: Env) {
  const token = bearer(req);
  if (!env.ADMIN_TOKEN || !token || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
    throw new HttpError(401, "invalid_admin_token", "Admin token required.");
  }
}

async function authenticate(req: Request, env: Env): Promise<string> {
  const key = bearer(req);
  if (!key) throw new HttpError(401, "missing_api_key", "Send your OpenAtlas key as `Authorization: Bearer <key>`.");
  const row = await env.DB.prepare("SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .bind(await sha256(key))
    .first<{ id: string }>();
  if (!row) throw new HttpError(401, "invalid_api_key", "Unknown or revoked OpenAtlas key.");
  return row.id;
}

const windowStart = (env: Env, now: number) => now - Number(env.ACTIVE_WINDOW_DAYS) * 86_400_000;

/**
 * Records activity for (key, end user). Existing active users are always let through;
 * a NEW user is refused once the active count has reached the cap.
 * Known limitation: two brand-new users racing at exactly the cap can both be admitted
 * (check-then-insert is not atomic across requests). Acceptable at this scale; documented.
 */
async function trackActiveUser(env: Env, keyId: string, endUser: unknown) {
  // Required so the license cap counts real end users, not developer keys.
  if (typeof endUser !== "string" || endUser.trim() === "" || endUser.length > 256) {
    throw new HttpError(
      400,
      "missing_user",
      "`user` is required: a stable, opaque ID for the end user of your app (max 256 chars). " +
        "It is hashed and used only to count active users against the N-ATLaS license cap.",
    );
  }
  const now = Date.now();
  const since = windowStart(env, now);
  const subject = await sha256(`${keyId}:${endUser}`);

  const existing = await env.DB.prepare("SELECT last_seen FROM active_users WHERE subject_hash = ?")
    .bind(subject)
    .first<{ last_seen: number }>();

  if (!existing || existing.last_seen < since) {
    const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM active_users WHERE last_seen >= ?")
      .bind(since)
      .first<{ n: number }>())!;
    if (n >= Number(env.ACTIVE_USER_CAP)) {
      throw new HttpError(
        429,
        "license_cap_reached",
        `The hosted N-ATLaS endpoint has reached its license cap of ${env.ACTIVE_USER_CAP} active users per ` +
          `${env.ACTIVE_WINDOW_DAYS} days. Existing users can continue; new users are refused until the window frees up.`,
      );
    }
  }

  await env.DB.prepare(
    `INSERT INTO active_users (subject_hash, key_id, first_seen, last_seen) VALUES (?1, ?2, ?3, ?3)
     ON CONFLICT(subject_hash) DO UPDATE SET last_seen = ?3`,
  )
    .bind(subject, keyId, now)
    .run();
}

const backendKind = (env: Env) => (env.BACKEND_KIND || "http").toLowerCase();
const backendBase = (env: Env) => (env.BACKEND_URL || "").replace(/\/+$/, "");

/** POST to a host implementing the backend contract (deploy/server/natlas_server.py). */
async function httpBackend(env: Env, path: string, payload: unknown): Promise<any> {
  if (!env.BACKEND_URL || !env.BACKEND_API_KEY) {
    throw new HttpError(503, "upstream_not_configured", "This gateway is not yet connected to an N-ATLaS backend.");
  }
  let res: Response;
  try {
    res = await fetch(backendBase(env) + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.BACKEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(env.UPSTREAM_TIMEOUT_MS)),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new HttpError(504, "upstream_timeout", "The N-ATLaS backend did not answer in time.");
    }
    throw new HttpError(503, "backend_unavailable", "The N-ATLaS backend is unreachable right now. Retry shortly.");
  }
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Tunnels and proxies answer with HTML when the backend behind them is down.
  }
  if (res.ok && body) return body;
  const detail = typeof body?.detail === "string" ? body.detail : text.slice(0, 300);
  if (res.status === 400) throw new HttpError(400, "invalid_request", detail);
  if (res.status === 401) throw new HttpError(502, "backend_auth_failed", "The gateway's backend credential was rejected (check BACKEND_API_KEY).");
  if (res.status === 503 || res.status >= 520 || !body) {
    throw new HttpError(503, "backend_unavailable", `The N-ATLaS backend is not serving right now (HTTP ${res.status}): ${detail}`);
  }
  throw new HttpError(502, "upstream_error", `Backend returned HTTP ${res.status}: ${detail}`);
}

async function backendChat(env: Env, openaiInput: Record<string, unknown>): Promise<any> {
  if (backendKind(env) === "runpod") {
    return runJob(env, env.LLM_ENDPOINT_ID, { openai_route: "/v1/chat/completions", openai_input: openaiInput });
  }
  return httpBackend(env, "/v1/chat/completions", openaiInput);
}

async function backendTranscribe(env: Env, input: { audio_base64: string; language: string }): Promise<any> {
  if (backendKind(env) === "runpod") return runJob(env, env.ASR_ENDPOINT_ID, input);
  return httpBackend(env, "/v1/audio/transcriptions", input);
}

/** RunPod fallback: queue a job, then poll until it finishes or the time budget runs out. */
async function runJob(env: Env, endpointId: string, input: unknown): Promise<unknown> {
  if (!env.RUNPOD_API_KEY || !endpointId) {
    throw new HttpError(503, "upstream_not_configured", "This gateway is not yet connected to a RunPod endpoint.");
  }
  const base = `${env.RUNPOD_API_BASE}/${endpointId}`;
  const headers = { Authorization: `Bearer ${env.RUNPOD_API_KEY}`, "Content-Type": "application/json" };
  const deadline = Date.now() + Number(env.UPSTREAM_TIMEOUT_MS);

  // /runsync holds the connection for a while and returns early if the job is fast (warm worker).
  let res = await fetch(`${base}/runsync`, { method: "POST", headers, body: JSON.stringify({ input }) });
  if (!res.ok) throw new HttpError(502, "upstream_error", `RunPod returned HTTP ${res.status}: ${await res.text()}`);
  let job = (await res.json()) as { id: string; status: string; output?: unknown; error?: unknown };

  let polls = 0;
  const interval = Math.max(2000, Math.floor(Number(env.UPSTREAM_TIMEOUT_MS) / MAX_POLLS));
  while (job.status === "IN_QUEUE" || job.status === "IN_PROGRESS") {
    if (Date.now() >= deadline || polls >= MAX_POLLS) {
      throw new HttpError(
        504,
        "upstream_timeout",
        "N-ATLaS did not finish in time. If the endpoint was idle this is likely a cold start (model loading); retry shortly.",
        job.id,
      );
    }
    await new Promise((r) => setTimeout(r, interval));
    polls++;
    res = await fetch(`${base}/status/${job.id}`, { headers });
    if (!res.ok) throw new HttpError(502, "upstream_error", `RunPod status returned HTTP ${res.status}`, job.id);
    job = (await res.json()) as typeof job;
  }

  if (job.status !== "COMPLETED") {
    throw new HttpError(502, "upstream_failed", `RunPod job ${job.status}: ${JSON.stringify(job.error ?? null)}`, job.id);
  }
  // Generator handlers (the vLLM worker) return a list of yielded values.
  const output = Array.isArray(job.output) ? job.output[0] : job.output;
  const workerError = (output as any)?.error;
  if (workerError) {
    throw new HttpError(502, "model_error", typeof workerError === "string" ? workerError : workerError.message ?? JSON.stringify(workerError), job.id);
  }
  return output;
}

async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
}

async function chat(req: Request, env: Env, keyId: string) {
  const body = await readJson(req);
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || !messages.every((m: any) => typeof m?.content === "string" && ["system", "user", "assistant"].includes(m?.role))) {
    throw new HttpError(400, "invalid_messages", "`messages` must be a non-empty array of {role: system|user|assistant, content: string}.");
  }
  if (body.language !== undefined && !CHAT_LANGUAGE_NAMES[body.language]) {
    throw new HttpError(400, "invalid_language", "`language` must be one of en, ha, yo, ig.");
  }
  await trackActiveUser(env, keyId, body.user);

  const finalMessages = messages.map((m: any) => ({ role: m.role, content: m.content }));
  if (body.language) {
    const instruction = `Respond in ${CHAT_LANGUAGE_NAMES[body.language]}.`;
    if (finalMessages[0].role === "system") finalMessages[0].content = `${finalMessages[0].content}\n\n${instruction}`;
    else finalMessages.unshift({ role: "system", content: instruction });
  }

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
  const output: any = await backendChat(env, {
    model: "n-atlas-llm",
    messages: finalMessages,
    max_tokens: Math.min(Number(body.max_tokens) || 512, 1024),
    temperature: typeof body.temperature === "number" ? body.temperature : 0.1,
    // Carried over from the Safroi Colab notebook, tested against real N-ATLaS weights.
    repetition_penalty: 1.12,
    // N-ATLaS's chat template otherwise hard-codes "Today Date: 26 Jul 2024".
    chat_template_kwargs: { date_string: today },
  });

  const content = output?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new HttpError(502, "unexpected_upstream_shape", "LLM response had no message content.");
  return { content: content.trim(), model: "n-atlas-llm", usage: output.usage };
}

async function transcribe(req: Request, env: Env, keyId: string) {
  const body = await readJson(req);
  if (!ASR_LANGUAGES.has(body?.language)) throw new HttpError(400, "invalid_language", "`language` must be one of en-ng, ha, yo, ig.");
  if (typeof body.audio !== "string" || body.audio.length === 0) throw new HttpError(400, "invalid_audio", "`audio` must be a base64 string.");
  if (body.audio.length > MAX_AUDIO_BASE64_CHARS) {
    throw new HttpError(413, "audio_too_large", "Audio is too large (limit ~7 MB before base64 encoding). Send a shorter clip.");
  }
  await trackActiveUser(env, keyId, body.user);

  const output: any = await backendTranscribe(env, { audio_base64: body.audio, language: body.language });
  if (typeof output?.text !== "string") throw new HttpError(502, "unexpected_upstream_shape", "ASR response had no text.");
  return { text: output.text, language: body.language, model: output.model ?? `n-atlas-asr-${body.language}` };
}

async function issueKey(req: Request, env: Env) {
  requireAdmin(req, env);
  const body = await readJson(req).catch(() => ({}));
  const label = typeof body?.label === "string" && body.label ? body.label.slice(0, 100) : "unlabelled";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = "oa_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO api_keys (id, key_hash, label, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, await sha256(key), label, Date.now())
    .run();
  return { id, label, key, note: "Store this key now; it is not shown again." };
}

async function usage(req: Request, env: Env) {
  requireAdmin(req, env);
  const since = windowStart(env, Date.now());
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM active_users WHERE last_seen >= ?").bind(since).first<{ n: number }>();
  const byKey = await env.DB.prepare(
    `SELECT k.label, COUNT(*) AS active_users FROM active_users u JOIN api_keys k ON k.id = u.key_id
     WHERE u.last_seen >= ? GROUP BY k.id ORDER BY active_users DESC`,
  )
    .bind(since)
    .all();
  const requests = await env.DB.prepare("SELECT COUNT(*) AS n FROM request_log WHERE at >= ?").bind(since).first<{ n: number }>();
  return {
    window_days: Number(env.ACTIVE_WINDOW_DAYS),
    cap: Number(env.ACTIVE_USER_CAP),
    active_users: active?.n ?? 0,
    requests_in_window: requests?.n ?? 0,
    by_key: byKey.results,
  };
}

function optionalText(v: unknown, field: string, max = MAX_ISSUE_TEXT): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new HttpError(400, "invalid_issue", `\`${field}\` must be a string.`);
  if (v.length > max) throw new HttpError(413, "issue_too_large", `\`${field}\` is longer than ${max} characters.`);
  return v;
}

/** reportIssue(): store a flagged N-ATLaS output with its correction. Only what the app sends is kept. */
async function createIssue(req: Request, env: Env, keyId: string) {
  const body = await readJson(req);
  if (body?.kind !== "chat" && body?.kind !== "transcription") {
    throw new HttpError(400, "invalid_issue", '`kind` must be "chat" or "transcription".');
  }
  const output = optionalText(body.output, "output");
  const correction = optionalText(body.correction, "correction");
  if (!output || !correction) {
    throw new HttpError(400, "invalid_issue", "`output` (what N-ATLaS returned) and `correction` are required.");
  }
  const input = optionalText(body.input, "input");
  if (body.kind === "chat" && !input) throw new HttpError(400, "invalid_issue", "`input` (the prompt) is required for chat issues.");
  const language = optionalText(body.language, "language", 16);
  if (language && !CHAT_LANGUAGE_NAMES[language] && !ASR_LANGUAGES.has(language)) {
    throw new HttpError(400, "invalid_language", "`language` must be one of en, en-ng, ha, yo, ig.");
  }
  const note = optionalText(body.note, "note", 2_000);
  const audio = optionalText(body.audio, "audio", MAX_ISSUE_AUDIO_BASE64);
  if (audio && body.kind !== "transcription") {
    throw new HttpError(400, "invalid_issue", "`audio` is only accepted for transcription issues.");
  }
  const user = optionalText(body.user, "user", 256);

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO issue_reports (id, created_at, key_id, user_hash, kind, language, input, output, correction, note, audio_base64)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, now, keyId, user ? await sha256(`${keyId}:${user}`) : null, body.kind, language, input, output, correction, note, audio)
    .run();
  return { id, received_at: new Date(now).toISOString() };
}

/** Operator export of issue reports, oldest first. Page with ?since=<next_since>. */
async function listIssues(req: Request, env: Env) {
  requireAdmin(req, env);
  const url = new URL(req.url);
  const since = Number(url.searchParams.get("since")) || 0;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);
  const audioColumn = url.searchParams.get("audio") === "1" ? "r.audio_base64" : "r.audio_base64 IS NOT NULL AS has_audio";
  const rows = await env.DB.prepare(
    `SELECT r.id, r.created_at, k.label AS key_label, r.user_hash, r.kind, r.language, r.input, r.output, r.correction, r.note,
            ${audioColumn}
     FROM issue_reports r LEFT JOIN api_keys k ON k.id = r.key_id
     WHERE r.created_at > ? ORDER BY r.created_at ASC LIMIT ?`,
  )
    .bind(since, limit)
    .all<{ created_at: number }>();
  return { issues: rows.results, next_since: rows.results.at(-1)?.created_at ?? since };
}

async function health(env: Env) {
  const kind = backendKind(env);
  if (kind === "runpod") {
    return {
      status: "ok",
      backend: {
        kind,
        mock: !env.RUNPOD_API_BASE.startsWith("https://api.runpod.ai/"),
        llm_configured: Boolean(env.RUNPOD_API_KEY && env.LLM_ENDPOINT_ID),
        asr_configured: Boolean(env.RUNPOD_API_KEY && env.ASR_ENDPOINT_ID),
      },
    };
  }
  const backend: Record<string, unknown> = { kind, configured: Boolean(env.BACKEND_URL && env.BACKEND_API_KEY) };
  if (env.BACKEND_URL) {
    backend.host = new URL(env.BACKEND_URL).host;
    try {
      const res = await fetch(backendBase(env) + "/health", { signal: AbortSignal.timeout(8000) });
      const h: any = await res.json();
      Object.assign(backend, { reachable: true, status: h.status, stage: h.stage, llm: h.llm, asr: h.asr, mock: h.mock === true });
    } catch {
      backend.reachable = false;
    }
  }
  return { status: "ok", backend };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    const route = `${req.method} ${pathname}`;
    const started = Date.now();
    let keyId: string | null = null;

    let response: Response;
    try {
      switch (route) {
        case "GET /v1/health":
          response = json(200, await health(env));
          break;
        case "POST /v1/issues":
          keyId = await authenticate(req, env);
          response = json(201, await createIssue(req, env, keyId));
          break;
        case "GET /v1/admin/issues":
          response = json(200, await listIssues(req, env));
          break;
        case "POST /v1/chat/completions":
          keyId = await authenticate(req, env);
          response = json(200, await chat(req, env, keyId));
          break;
        case "POST /v1/audio/transcriptions":
          keyId = await authenticate(req, env);
          response = json(200, await transcribe(req, env, keyId));
          break;
        case "POST /v1/admin/keys":
          response = json(201, await issueKey(req, env));
          break;
        case "GET /v1/usage":
          response = json(200, await usage(req, env));
          break;
        default:
          throw new HttpError(404, "not_found", `No route for ${route}.`);
      }
    } catch (err) {
      const e = err instanceof HttpError ? err : new HttpError(500, "internal_error", err instanceof Error ? err.message : "Internal error");
      response = errorResponse(e);
    }

    if (keyId) {
      ctx.waitUntil(
        env.DB.prepare("INSERT INTO request_log (at, key_id, route, status, latency_ms) VALUES (?, ?, ?, ?, ?)")
          .bind(started, keyId, pathname, response.status, Date.now() - started)
          .run(),
      );
    }
    return response;
  },
};
