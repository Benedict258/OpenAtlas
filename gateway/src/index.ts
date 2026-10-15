// OpenAtlas gateway: one public URL + OpenAtlas keys in front of a swappable GPU backend.
//
// - Verifies OpenAtlas keys (stored as SHA-256 hashes in D1).
// - Counts distinct active users over a rolling window and refuses NEW users at the
//   N-ATLaS license cap, so compliance is measured rather than assumed.
// - Stores reportIssue() submissions in the same D1 database.
// - Proxies to whichever backend the config names, holding its credential:
//     BACKEND_KIND=http    any host serving the backend contract (deploy/server/natlas_server.py):
//                          Colab, Kaggle or AMD. Set BACKEND_URL + BACKEND_API_KEY.
//     BACKEND_KIND=runpod  RunPod Serverless (scripted, never run): RUNPOD_API_KEY + LLM/ASR endpoint IDs.
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
  TTS_ENABLED: string;
  DEFAULT_DAILY_REQUEST_LIMIT: string;
  DEFAULT_KEY_MAX_ACTIVE_USERS: string;
  // Self-serve keys from the website's request form (createKeyRequest).
  SELF_SERVE_DAILY_REQUEST_LIMIT: string;
  SELF_SERVE_MAX_ACTIVE_USERS: string;
  PUBLIC_API_URL: string;
  // Email through Resend. Without RESEND_API_KEY and FROM_EMAIL no email is sent; the key is still issued
  // and shown on screen. ADMIN_EMAIL receives a copy of every request (never the key itself).
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  ADMIN_EMAIL?: string;
  SUPPORT_EMAIL?: string;
}

/** An authenticated OpenAtlas key and its limits (null = no limit). */
interface ApiKey {
  id: string;
  daily_request_limit: number | null;
  max_active_users: number | null;
}

const CHAT_LANGUAGE_NAMES: Record<string, string> = { en: "English", ha: "Hausa", yo: "Yoruba", ig: "Igbo" };
const ASR_LANGUAGES = new Set(["en-ng", "ha", "yo", "ig"]);
// Responses name the models by their own Hugging Face IDs. N-ATLaS's terms require any renamed
// N-ATLaS model to carry "Powered by Awarri", so we don't rename them, and every model response
// carries the attribution as well.
const LLM_MODEL = "NCAIR1/N-ATLaS";
const ASR_MODELS: Record<string, string> = {
  ha: "NCAIR1/Hausa-ASR",
  yo: "NCAIR1/Yoruba-ASR",
  ig: "NCAIR1/Igbo-ASR",
  "en-ng": "NCAIR1/NigerianAccentedEnglish",
};
const ATTRIBUTION = "Powered by Awarri";
// Optional speech output. Not an N-ATLaS model: it only renders text the app already has (normally N-ATLaS's
// reply) as audio. Each engine's own license credit travels with its audio.
const SPEECH_LANGUAGES = new Set(["en", "ha", "yo", "ig", "pcm"]);
const SPEECH_ENGINES = new Set(["auto", "sorotts", "mms"]);
const MAX_SPEECH_CHARS = 1_000;
const SPEECH_CREDITS: Record<string, string> = {
  "Shinzmann/sorotts": "Speech: SoroTTS (Orpheus-3B fine-tune), CC BY-NC-SA 4.0",
  "Shinzmann/soro-tts-ibo": "Speech: Soro-TTS Igbo (MMS-TTS fine-tune), CC BY-NC 4.0",
};
const speechCredit = (model: string) => SPEECH_CREDITS[model] ?? `Speech: Meta MMS-TTS (${model}), CC BY-NC 4.0`;
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

async function authenticate(req: Request, env: Env): Promise<ApiKey> {
  const key = bearer(req);
  if (!key) throw new HttpError(401, "missing_api_key", "Send your OpenAtlas key as `Authorization: Bearer <key>`.");
  const row = await env.DB.prepare("SELECT id, daily_request_limit, max_active_users FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .bind(await sha256(key))
    .first<ApiKey>();
  if (!row) throw new HttpError(401, "invalid_api_key", "Unknown or revoked OpenAtlas key.");
  return row;
}

const DAY_MS = 86_400_000;
const windowStart = (env: Env, now: number) => now - Number(env.ACTIVE_WINDOW_DAYS) * DAY_MS;

/** Per-key quota: requests in the last 24 h (refused requests don't count). */
async function enforceDailyLimit(env: Env, key: ApiKey) {
  if (key.daily_request_limit == null) return;
  const { n } = (await env.DB.prepare("SELECT COUNT(*) AS n FROM request_log WHERE key_id = ? AND at >= ? AND status != 429")
    .bind(key.id, Date.now() - DAY_MS)
    .first<{ n: number }>())!;
  if (n >= key.daily_request_limit) {
    throw new HttpError(429, "key_quota_exceeded", `This key has used its ${key.daily_request_limit} requests for the last 24 hours. Try again later, or ask the OpenAtlas operator for a higher limit.`);
  }
}

/**
 * Runs before every model call: checks the key's daily quota, then records activity for (key, end user).
 * Existing active users are always let through; a NEW user is refused once the active count has reached
 * the license cap, or this key's own share of it (max_active_users).
 * Known limitation: two brand-new users racing at exactly the cap can both be admitted
 * (check-then-insert is not atomic across requests). Acceptable at this scale; documented.
 */
async function trackActiveUser(env: Env, key: ApiKey, endUser: unknown) {
  const keyId = key.id;
  // Required so the license cap counts real end users, not developer keys.
  if (typeof endUser !== "string" || endUser.trim() === "" || endUser.length > 256) {
    throw new HttpError(
      400,
      "missing_user",
      "`user` is required: a stable, opaque ID for the end user of your app (max 256 chars). " +
        "It is hashed and used only to count active users against the N-ATLaS license cap.",
    );
  }
  await enforceDailyLimit(env, key);
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
    if (key.max_active_users != null) {
      const own = (await env.DB.prepare("SELECT COUNT(*) AS n FROM active_users WHERE key_id = ? AND last_seen >= ?")
        .bind(keyId, since)
        .first<{ n: number }>())!;
      if (own.n >= key.max_active_users) {
        throw new HttpError(
          429,
          "key_user_share_reached",
          `This key has reached its share of the license cap: ${key.max_active_users} active users per ${env.ACTIVE_WINDOW_DAYS} days. ` +
            "Existing users can continue; ask the OpenAtlas operator to raise it.",
        );
      }
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
  const isForm = payload instanceof FormData;
  if (!env.BACKEND_URL || !env.BACKEND_API_KEY) {
    throw new HttpError(503, "upstream_not_configured", "This gateway is not yet connected to an N-ATLaS backend.");
  }
  let res: Response;
  try {
    res = await fetch(backendBase(env) + path, {
      method: "POST",
      // fetch sets the multipart boundary itself for FormData.
      headers: isForm ? { Authorization: `Bearer ${env.BACKEND_API_KEY}` } : { Authorization: `Bearer ${env.BACKEND_API_KEY}`, "Content-Type": "application/json" },
      body: isForm ? payload : JSON.stringify(payload),
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
  if (res.status === 404) throw new HttpError(502, "backend_route_missing", `The backend has no ${path} route (check BACKEND_URL has no extra path such as /v1).`);
  if (res.status === 401) throw new HttpError(502, "backend_auth_failed", "The gateway's backend credential was rejected (check BACKEND_API_KEY).");
  // A 500 is the backend failing on this particular request (it is up, so retrying won't help).
  if (res.status === 500) {
    throw new HttpError(502, "backend_error", `The N-ATLaS backend failed on this request (HTTP 500): ${detail}`);
  }
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
  // Multipart upload (field `audio` + `language`), the usual shape for a transcription API.
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(input.audio_base64.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, "invalid_audio", "`audio` is not valid base64.");
  }
  const form = new FormData();
  form.append("audio", new Blob([bytes]), "audio");
  form.append("language", input.language);
  return httpBackend(env, "/v1/audio/transcriptions", form);
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

async function chat(req: Request, env: Env, key: ApiKey) {
  const body = await readJson(req);
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || !messages.every((m: any) => typeof m?.content === "string" && ["system", "user", "assistant"].includes(m?.role))) {
    throw new HttpError(400, "invalid_messages", "`messages` must be a non-empty array of {role: system|user|assistant, content: string}.");
  }
  if (body.language !== undefined && !CHAT_LANGUAGE_NAMES[body.language]) {
    throw new HttpError(400, "invalid_language", "`language` must be one of en, ha, yo, ig.");
  }
  await trackActiveUser(env, key, body.user);

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
    // Carried over from an earlier Colab notebook, tested against real N-ATLaS weights.
    repetition_penalty: 1.12,
    // N-ATLaS's chat template otherwise hard-codes "Today Date: 26 Jul 2024".
    chat_template_kwargs: { date_string: today },
  });

  // OpenAI shape ({choices}) or a plain {content} body; backends may answer with either.
  const content = output?.choices?.[0]?.message?.content ?? output?.content;
  if (typeof content !== "string") throw new HttpError(502, "unexpected_upstream_shape", "LLM response had no message content.");
  return { content: content.trim(), model: LLM_MODEL, attribution: ATTRIBUTION, usage: output.usage };
}

async function transcribe(req: Request, env: Env, key: ApiKey) {
  const body = await readJson(req);
  if (!ASR_LANGUAGES.has(body?.language)) throw new HttpError(400, "invalid_language", "`language` must be one of en-ng, ha, yo, ig.");
  if (typeof body.audio !== "string" || body.audio.length === 0) throw new HttpError(400, "invalid_audio", "`audio` must be a base64 string.");
  if (body.audio.length > MAX_AUDIO_BASE64_CHARS) {
    throw new HttpError(413, "audio_too_large", "Audio is too large (limit ~7 MB before base64 encoding). Send a shorter clip.");
  }
  await trackActiveUser(env, key, body.user);

  const output: any = await backendTranscribe(env, { audio_base64: body.audio, language: body.language });
  if (typeof output?.text !== "string") throw new HttpError(502, "unexpected_upstream_shape", "ASR response had no text.");
  return { text: output.text, language: body.language, model: ASR_MODELS[body.language], attribution: ATTRIBUTION };
}

/** speak(): text → speech through the backend's optional renderer (deploy/server/tts_renderer.py). */
async function speech(req: Request, env: Env, key: ApiKey) {
  if (env.TTS_ENABLED !== "true") throw new HttpError(404, "tts_disabled", "Speech output is switched off on this gateway.");
  const body = await readJson(req);
  if (!SPEECH_LANGUAGES.has(body?.language)) throw new HttpError(400, "invalid_language", "`language` must be one of en, ha, yo, ig, pcm.");
  if (typeof body.text !== "string" || !body.text.trim()) throw new HttpError(400, "invalid_text", "`text` must be a non-empty string.");
  if (body.text.length > MAX_SPEECH_CHARS) throw new HttpError(413, "text_too_long", `\`text\` is limited to ${MAX_SPEECH_CHARS} characters.`);
  const engine = body.engine ?? "auto";
  if (!SPEECH_ENGINES.has(engine)) throw new HttpError(400, "invalid_engine", "`engine` must be auto, sorotts or mms.");
  await trackActiveUser(env, key, body.user);
  if (backendKind(env) !== "http") throw new HttpError(501, "tts_unsupported_backend", "Speech output needs an http backend.");

  const output: any = await httpBackend(env, "/v1/audio/speech", { text: body.text, language: body.language, engine });
  if (typeof output?.audio_base64 !== "string") throw new HttpError(502, "unexpected_upstream_shape", "Speech response had no audio.");
  return {
    audio: output.audio_base64,
    format: output.format ?? "wav",
    sample_rate: output.sample_rate,
    seconds: output.seconds,
    language: body.language,
    engine: output.engine,
    model: output.model,
    voice: output.voice ?? null,
    sentences: output.sentences,
    warnings: Array.isArray(output.warnings) ? output.warnings : [],
    ...(output.fallback_reason ? { fallback_reason: output.fallback_reason } : {}),
    attribution: speechCredit(output.model),
  };
}

type Limits = { daily_request_limit: number | null; max_active_users: number | null };

/** A limit from an admin request: a positive whole number, null (no limit), or undefined (not given). */
function limitValue(v: unknown, field: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) throw new HttpError(400, "invalid_limit", `\`${field}\` must be a positive whole number or null (no limit).`);
  return v;
}

/** Limits for a new key: the gateway defaults (wrangler.toml), unless the admin request says otherwise. */
function newKeyLimits(env: Env, body: any): Limits {
  const dflt = (v: string) => (Number(v) > 0 ? Number(v) : null);
  const daily = limitValue(body?.daily_request_limit, "daily_request_limit");
  const users = limitValue(body?.max_active_users, "max_active_users");
  return {
    daily_request_limit: daily === undefined ? dflt(env.DEFAULT_DAILY_REQUEST_LIMIT) : daily,
    max_active_users: users === undefined ? dflt(env.DEFAULT_KEY_MAX_ACTIVE_USERS) : users,
  };
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Issues a key: only its SHA-256 hash (what authenticate() looks up) and a short display prefix are stored.
 * Admin-issued keys are "oa_" + 24 random bytes; self-serve keys from the website form are "oa_live_" + 32.
 */
async function createKey(env: Env, label: string, limits: Limits, selfServe = false) {
  const key = selfServe ? `oa_live_${hex(crypto.getRandomValues(new Uint8Array(32)))}` : `oa_${hex(crypto.getRandomValues(new Uint8Array(24)))}`;
  const prefix = key.slice(0, selfServe ? 14 : 9);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO api_keys (id, key_hash, key_prefix, label, created_at, daily_request_limit, max_active_users) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, await sha256(key), prefix, label, Date.now(), limits.daily_request_limit, limits.max_active_users)
    .run();
  return { id, label, key, prefix, ...limits, note: "Store this key now; it is not shown again." };
}

async function issueKey(req: Request, env: Env) {
  requireAdmin(req, env);
  const body = await readJson(req).catch(() => ({}));
  return createKey(env, typeof body?.label === "string" && body.label ? body.label.slice(0, 100) : "unlabelled", newKeyLimits(env, body));
}

/** Admin: every key with its limits and usage. The keys themselves are never stored, so never listed. */
async function listKeys(req: Request, env: Env) {
  requireAdmin(req, env);
  const now = Date.now();
  const since = windowStart(env, now);
  const rows = await env.DB.prepare(
    `SELECT k.id, k.label, k.created_at, k.revoked_at, k.revoked_reason, k.daily_request_limit, k.max_active_users,
       (SELECT COUNT(*) FROM request_log r WHERE r.key_id = k.id AND r.at >= ?1) AS requests_24h,
       (SELECT COUNT(*) FROM request_log r WHERE r.key_id = k.id AND r.at >= ?2) AS requests_window,
       (SELECT COUNT(*) FROM request_log r WHERE r.key_id = k.id AND r.at >= ?2 AND r.status >= 400) AS errors_window,
       (SELECT COUNT(*) FROM active_users u WHERE u.key_id = k.id AND u.last_seen >= ?2) AS active_users_window,
       (SELECT MIN(at) FROM request_log r WHERE r.key_id = k.id) AS first_request_at,
       (SELECT MAX(at) FROM request_log r WHERE r.key_id = k.id) AS last_request_at
     FROM api_keys k ORDER BY k.created_at ASC`,
  )
    .bind(now - DAY_MS, since)
    .all();
  const routes = await env.DB.prepare(
    "SELECT key_id, route, COUNT(*) AS n FROM request_log WHERE at >= ? GROUP BY key_id, route",
  )
    .bind(since)
    .all<{ key_id: string; route: string; n: number }>();
  const byRoute: Record<string, Record<string, number>> = {};
  for (const r of routes.results) (byRoute[r.key_id] ??= {})[r.route] = r.n;
  return {
    window_days: Number(env.ACTIVE_WINDOW_DAYS),
    keys: rows.results.map((k: any) => ({ ...k, routes_window: byRoute[k.id] ?? {} })),
  };
}

async function findKey(env: Env, id: unknown) {
  if (typeof id !== "string" || !id) throw new HttpError(400, "invalid_key_id", "`id` (the key's id, not the key itself) is required.");
  const row = await env.DB.prepare("SELECT id, label, revoked_at FROM api_keys WHERE id = ?").bind(id).first<{ id: string; label: string; revoked_at: number | null }>();
  if (!row) throw new HttpError(404, "not_found", "No key with that id.");
  return row;
}

/** Admin: revoke a key. Takes effect on the key's next request; its usage history is kept. */
async function revokeKey(req: Request, env: Env) {
  requireAdmin(req, env);
  const body = await readJson(req);
  const key = await findKey(env, body?.id);
  if (key.revoked_at) throw new HttpError(409, "already_revoked", `Key ${key.label} was already revoked.`);
  const reason = optionalText(body?.reason, "reason", 500);
  const at = Date.now();
  await env.DB.prepare("UPDATE api_keys SET revoked_at = ?, revoked_reason = ? WHERE id = ?").bind(at, reason, key.id).run();
  return { id: key.id, label: key.label, revoked_at: new Date(at).toISOString(), reason };
}

/** Admin: change a key's limits. Give a number, or null to remove that limit; omitted fields are unchanged. */
async function setKeyLimits(req: Request, env: Env) {
  requireAdmin(req, env);
  const body = await readJson(req);
  const key = await findKey(env, body?.id);
  const daily = limitValue(body?.daily_request_limit, "daily_request_limit");
  const users = limitValue(body?.max_active_users, "max_active_users");
  if (daily === undefined && users === undefined) throw new HttpError(400, "invalid_limit", "Give `daily_request_limit` and/or `max_active_users`.");
  if (daily !== undefined) await env.DB.prepare("UPDATE api_keys SET daily_request_limit = ? WHERE id = ?").bind(daily, key.id).run();
  if (users !== undefined) await env.DB.prepare("UPDATE api_keys SET max_active_users = ? WHERE id = ?").bind(users, key.id).run();
  return env.DB.prepare("SELECT id, label, daily_request_limit, max_active_users FROM api_keys WHERE id = ?").bind(key.id).first();
}

function requiredText(v: unknown, field: string, max: number): string {
  const text = optionalText(typeof v === "string" ? v.trim() : v, field, max);
  if (!text) throw new HttpError(400, "invalid_key_request", `\`${field}\` is required.`);
  return text;
}

// Self-serve key requests (the website's "Request an API key" form): limits on how fast keys can be minted.
const KEY_REQUESTS_PER_EMAIL_PER_DAY = 3;
const KEY_REQUESTS_PER_IP_PER_DAY = 5;
const KEY_REQUESTS_PER_HOUR = 60; // across everyone: a ceiling on abuse
const EXPECTED_USERS = new Set(["Under 50", "50 to 200", "200 to 1,000", "Not sure yet"]);
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
const invalidRequest = (message: string) => new HttpError(400, "invalid_key_request", message);

/**
 * Public: the website's "Request an API key" form. Issues a working key straight away, in the same table
 * authenticate() reads, revokes any earlier key issued to the same email, and emails the key (Resend).
 * The raw key is returned once in the response and in the requester's email; it is never stored or logged.
 */
async function createKeyRequest(req: Request, env: Env, ctx: ExecutionContext) {
  const body = await readJson(req);
  // Honeypot: a field people never see. Anything in it means a bot filled the form.
  if (typeof body?.website === "string" && body.website.trim()) throw invalidRequest("Request rejected.");
  const name = requiredText(body?.name, "name", 100);
  const email = requiredText(body?.email, "email", 254).toLowerCase();
  if (!EMAIL_RE.test(email)) throw invalidRequest("Enter a valid email address.");
  const project = requiredText(body?.project, "project", 200);
  const organization = optionalText(typeof body?.organization === "string" ? body.organization.trim() : body?.organization, "organization", 200);
  const building = requiredText(body?.use_case, "use_case", 2_000);
  const expectedUsers = requiredText(body?.expected_users, "expected_users", 50);
  if (!EXPECTED_USERS.has(expectedUsers)) throw invalidRequest("Choose how many end users you expect.");
  if (body?.accept_terms !== true) {
    throw invalidRequest("You must accept the N-ATLaS Terms of Use (non-commercial, 1,000 active users per 30 days).");
  }

  // The client's address: set by Cloudflare's edge on a direct request, and passed on by the website Worker
  // when the form comes through it. Only its hash is stored.
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const country = (req.headers.get("CF-IPCountry") ?? "").slice(0, 2) || null;
  const ipHash = await sha256(`key-request|${ip}`);
  const now = Date.now();
  const since = now - DAY_MS;
  const [byEmail, byIp, total] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM key_requests WHERE email = ? AND created_at >= ?").bind(email, since).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM key_requests WHERE ip_hash = ? AND created_at >= ?").bind(ipHash, since).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM key_requests WHERE created_at >= ?").bind(now - 3_600_000).first<{ n: number }>(),
  ]);
  if ((byEmail?.n ?? 0) >= KEY_REQUESTS_PER_EMAIL_PER_DAY) {
    throw new HttpError(429, "too_many_requests", "Too many keys requested for this email today. Use the most recent key we sent, or try again tomorrow.");
  }
  if ((byIp?.n ?? 0) >= KEY_REQUESTS_PER_IP_PER_DAY || (total?.n ?? 0) >= KEY_REQUESTS_PER_HOUR) {
    throw new HttpError(429, "too_many_requests", "Too many key requests. Try again later.");
  }

  // One live key per email: a new request replaces (revokes) the keys issued to that email before.
  const previous = await env.DB.prepare("SELECT key_id FROM key_requests WHERE email = ? AND key_id IS NOT NULL").bind(email).all<{ key_id: string }>();
  const issued = await createKey(env, `${email} · ${project}`.slice(0, 100), {
    daily_request_limit: Number(env.SELF_SERVE_DAILY_REQUEST_LIMIT) || null,
    max_active_users: Number(env.SELF_SERVE_MAX_ACTIVE_USERS) || null,
  }, true);
  const replaced: string[] = [];
  for (const { key_id } of previous.results) {
    const r = await env.DB.prepare("UPDATE api_keys SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL")
      .bind(now, "replaced by a new request from the same email", key_id)
      .run();
    if (r.meta.changes) replaced.push(key_id);
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO key_requests (id, created_at, name, email, project, organization, use_case, expected_users, status, key_id, decided_at, ip_hash, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?)`,
  )
    .bind(id, now, name, email, project, organization, building, expectedUsers, issued.id, now, ipHash, country)
    .run();

  const request = { name, email, project, organization, building, expectedUsers, country, at: new Date(now).toISOString() };
  // The requester's email is awaited so the page can say whether it went; a failure doesn't lose the key.
  const emailed = await sendEmail(env, keyEmail(env, request, issued.key)).then(
    () => true,
    (e) => (console.error(`key email to requester failed (${issued.prefix}…): ${e instanceof Error ? e.message : e}`), false),
  );
  if (env.ADMIN_EMAIL) {
    ctx.waitUntil(
      sendEmail(env, adminEmail(env, request, issued.prefix, replaced.length)).catch((e) =>
        console.error(`admin copy failed (${issued.prefix}…): ${e instanceof Error ? e.message : e}`),
      ),
    );
  }
  return {
    id,
    key: issued.key,
    key_prefix: issued.prefix,
    emailed,
    replaced_previous_key: replaced.length > 0,
    daily_request_limit: issued.daily_request_limit,
    max_active_users: issued.max_active_users,
    base_url: env.PUBLIC_API_URL,
  };
}

type KeyRequestDetails = {
  name: string; email: string; project: string; organization: string | null; building: string; expectedUsers: string; country: string | null; at: string;
};
type Email = { to: string; subject: string; text: string; html: string; reply_to?: string };

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Sends one email through Resend's REST API. Throws if Resend isn't configured or refuses it. */
async function sendEmail(env: Env, email: Email): Promise<void> {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) throw new Error("email is not configured (RESEND_API_KEY / FROM_EMAIL)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, ...email }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function keyEmail(env: Env, r: KeyRequestDetails, key: string): Email {
  const support = env.SUPPORT_EMAIL || env.FROM_EMAIL || "";
  const base = env.PUBLIC_API_URL;
  const usage = [
    `import { OpenAtlas } from "@openatlas/sdk";`,
    `const client = new OpenAtlas({ apiKey: "${key}" });`,
    `const { content } = await client.chat({ messages: [{ role: "user", content: "Sannu!" }], language: "ha", user: "user-1" });`,
  ].join("\n");
  const text = [
    `Hi ${r.name},`,
    "",
    "Here is your OpenAtlas API key. It is shown only once, so store it somewhere safe and keep it secret:",
    "",
    key,
    "",
    "What you submitted:",
    `  Project: ${r.project}`,
    `  Organization: ${r.organization ?? "(none given)"}`,
    `  What you're building: ${r.building}`,
    "",
    "Quick start:",
    "  npm install @openatlas/sdk",
    "",
    usage,
    "",
    `Gateway base URL: ${base} (the SDK uses it by default).`,
    "Every call needs a `user`: a stable, opaque ID for your end user, used only for the N-ATLaS licence count.",
    "",
    "N-ATLaS is for non-commercial use, capped at 1,000 active end users per 30 days, and output must be shown with \"Powered by Awarri\".",
    support ? `Questions? Reply to this email or write to ${support}.` : "Questions? Reply to this email.",
    "",
    "OpenAtlas",
  ].join("\n");
  const pre = "font-family:ui-monospace,Menlo,Consolas,monospace;background:#F1F2EC;border:1px solid #D9DCD4;border-radius:6px;padding:12px 14px;white-space:pre-wrap;word-break:break-all";
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#111411;max-width:620px">
<p>Hi ${escapeHtml(r.name)},</p>
<p>Here is your OpenAtlas API key. <b>It is shown only once</b>, so store it somewhere safe and keep it secret:</p>
<pre style="${pre};font-size:14px">${escapeHtml(key)}</pre>
<p><b>What you submitted</b><br>Project: ${escapeHtml(r.project)}<br>Organization: ${escapeHtml(r.organization ?? "(none given)")}<br>What you're building: ${escapeHtml(r.building)}</p>
<p><b>Quick start</b></p>
<pre style="${pre};font-size:13px">npm install @openatlas/sdk</pre>
<pre style="${pre};font-size:13px">${escapeHtml(usage)}</pre>
<p>Gateway base URL: <code>${escapeHtml(base)}</code> (the SDK uses it by default). Every call needs a <code>user</code>: a stable, opaque ID for your end user, used only for the N-ATLaS licence count.</p>
<p style="color:#4A524C;font-size:14px">N-ATLaS is for non-commercial use, capped at 1,000 active end users per 30 days, and output must be shown with "Powered by Awarri".</p>
<p>${support ? `Questions? Reply to this email or write to ${escapeHtml(support)}.` : "Questions? Reply to this email."}</p>
<p>OpenAtlas</p>
</div>`;
  return { to: r.email, subject: "Your OpenAtlas API key", text, html, ...(support ? { reply_to: support } : {}) };
}

function adminEmail(env: Env, r: KeyRequestDetails, prefix: string, replaced: number): Email {
  const rows: [string, string][] = [
    ["Name", r.name],
    ["Email", r.email],
    ["Project", r.project],
    ["Organization", r.organization ?? "(none)"],
    ["What they're building", r.building],
    ["Expected end users", r.expectedUsers],
    ["Time (UTC)", r.at],
    ["Country (from IP)", r.country ?? "unknown"],
    ["Key prefix", `${prefix}…`],
    ["Replaced earlier key", replaced ? "yes" : "no"],
  ];
  return {
    to: env.ADMIN_EMAIL!,
    subject: `OpenAtlas key issued: ${r.project} (${r.email})`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
    html: `<table style="font-family:system-ui,sans-serif;font-size:14px;border-collapse:collapse">${rows
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#4A524C;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
      .join("")}</table>`,
    reply_to: r.email,
  };
}

async function listKeyRequests(req: Request, env: Env) {
  requireAdmin(req, env);
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const rows = await env.DB.prepare("SELECT * FROM key_requests WHERE status = ? ORDER BY created_at ASC LIMIT 200").bind(status).all();
  return { requests: rows.results };
}

/** Admin: approve (issues a key, returned once) or decline a request. */
async function decideKeyRequest(req: Request, env: Env) {
  requireAdmin(req, env);
  const body = await readJson(req);
  if (body?.decision !== "approve" && body?.decision !== "decline") {
    throw new HttpError(400, "invalid_decision", '`decision` must be "approve" or "decline".');
  }
  const request = await env.DB.prepare("SELECT * FROM key_requests WHERE id = ?").bind(body.id).first<{ email: string; project: string; status: string }>();
  if (!request) throw new HttpError(404, "not_found", "No key request with that id.");
  if (request.status !== "pending") throw new HttpError(409, "already_decided", `Request is already ${request.status}.`);
  const issued = body.decision === "approve" ? await createKey(env, `${request.email} · ${request.project}`.slice(0, 100), newKeyLimits(env, body)) : null;
  await env.DB.prepare("UPDATE key_requests SET status = ?, key_id = ?, decided_at = ? WHERE id = ?")
    .bind(body.decision === "approve" ? "approved" : "declined", issued?.id ?? null, Date.now(), body.id)
    .run();
  return { id: body.id, email: request.email, status: body.decision === "approve" ? "approved" : "declined", ...(issued ? { key: issued.key, note: issued.note } : {}) };
}

async function usage(req: Request, env: Env) {
  requireAdmin(req, env);
  const since = windowStart(env, Date.now());
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM active_users WHERE last_seen >= ?").bind(since).first<{ n: number }>();
  const byKey = await env.DB.prepare(
    `SELECT k.label, k.max_active_users AS user_share,
       (SELECT COUNT(*) FROM active_users u WHERE u.key_id = k.id AND u.last_seen >= ?1) AS active_users,
       (SELECT COUNT(*) FROM request_log r WHERE r.key_id = k.id AND r.at >= ?1) AS requests
     FROM api_keys k WHERE k.revoked_at IS NULL ORDER BY active_users DESC, requests DESC`,
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
      if (env.TTS_ENABLED === "true") backend.tts = h.tts ? { status: h.tts.status, engines: h.tts.engines, languages: h.tts.languages } : null;
    } catch {
      backend.reachable = false;
    }
  }
  return { status: "ok", backend, tts_enabled: env.TTS_ENABLED === "true" };
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
          keyId = (await authenticate(req, env)).id;
          response = json(201, await createIssue(req, env, keyId));
          break;
        case "GET /v1/admin/issues":
          response = json(200, await listIssues(req, env));
          break;
        case "POST /v1/chat/completions": {
          const key = await authenticate(req, env);
          keyId = key.id;
          response = json(200, await chat(req, env, key));
          break;
        }
        case "POST /v1/audio/transcriptions": {
          const key = await authenticate(req, env);
          keyId = key.id;
          response = json(200, await transcribe(req, env, key));
          break;
        }
        case "POST /v1/audio/speech": {
          const key = await authenticate(req, env);
          keyId = key.id;
          response = json(200, await speech(req, env, key));
          break;
        }
        case "GET /v1/admin/keys":
          response = json(200, await listKeys(req, env));
          break;
        case "POST /v1/admin/keys/revoke":
          response = json(200, await revokeKey(req, env));
          break;
        case "POST /v1/admin/keys/limits":
          response = json(200, await setKeyLimits(req, env));
          break;
        case "POST /v1/key-requests":
          response = json(201, await createKeyRequest(req, env, ctx));
          break;
        case "GET /v1/admin/key-requests":
          response = json(200, await listKeyRequests(req, env));
          break;
        case "POST /v1/admin/key-requests/decide":
          response = json(200, await decideKeyRequest(req, env));
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
