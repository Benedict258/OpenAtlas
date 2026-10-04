import { OpenAtlasAPIError, OpenAtlasConnectionError, OpenAtlasError, OpenAtlasTimeoutError } from "./errors.js";
import { normalizeText, type NormalizeOptions } from "./normalize.js";
import type {
  AudioInput,
  ChatParams,
  ChatResponse,
  ReportIssueParams,
  ReportIssueResponse,
  SpeakParams,
  SpeakResponse,
  TranscribeParams,
  TranscribeResponse,
} from "./types.js";

const CHAT_LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const TRANSCRIBE_LANGUAGES = new Set(["en-ng", "ha", "yo", "ig"]);
const SPEAK_LANGUAGES = new Set(["en", "ha", "yo", "ig", "pcm"]);
const MAX_SPEAK_CHARS = 1_000;

/** Public OpenAtlas gateway (Cloudflare Worker). Override with `baseURL` or `OPENATLAS_BASE_URL`. */
export const DEFAULT_BASE_URL: string | undefined = "https://openatlas-gateway.isaacbenedict001.workers.dev";

export interface OpenAtlasOptions {
  /** Defaults to `process.env.OPENATLAS_API_KEY`. */
  apiKey?: string;
  /** Defaults to `process.env.OPENATLAS_BASE_URL`, then the hosted gateway. */
  baseURL?: string;
  /**
   * Per-request timeout. Default 300 000 ms (5 min), the same as the gateway's own wait, so a request that
   * arrives while the backend is still starting gets an answer rather than a client-side timeout.
   */
  timeoutMs?: number;
  /**
   * Retries for network errors and 503 (backend temporarily unavailable). Default 2. Other errors
   * (4xx, and 502/504, which mean the backend failed on or timed out on this request) are not retried.
   */
  maxRetries?: number;
  /** Custom fetch implementation (tests, proxies). */
  fetch?: typeof fetch;
  /**
   * Run `normalizeText()` automatically on chat messages and replies and on transcripts.
   * Default false.
   */
  normalize?: boolean;
}

// An empty variable (common in .env templates) counts as unset, so the defaults still apply.
const env = (name: string): string | undefined =>
  (typeof process !== "undefined" ? process.env?.[name] : undefined) || undefined;

/**
 * Client for the OpenAtlas gateway: N-ATLaS text (`chat()`), speech recognition (`transcribe()`), optional
 * speech output (`speak()`) and corrections (`reportIssue()`), with one API key.
 *
 * Use it from server-side code: the gateway sends no CORS headers, and an API key in a browser is public.
 * Every model call needs `user`, a stable opaque ID for your end user, which the gateway counts (hashed)
 * against the N-ATLaS license cap of 1,000 active users per 30 days.
 *
 * Errors: invalid arguments throw {@link OpenAtlasError} before any request is made; gateway errors throw
 * {@link OpenAtlasAPIError} with a `status` and a `code`; {@link OpenAtlasTimeoutError} and
 * {@link OpenAtlasConnectionError} cover the rest. Network failures and `503` are retried (`maxRetries`).
 *
 * @example
 * ```ts
 * import { OpenAtlas } from "@openatlas/sdk";
 * const client = new OpenAtlas(); // reads OPENATLAS_API_KEY
 * const { content, attribution } = await client.chat({
 *   messages: [{ role: "user", content: "Ina zan je don yin rajistar katin zabe?" }],
 *   language: "ha",
 *   user: "user-123",
 * });
 * console.log(content, `(${attribution})`);
 * ```
 */
export class OpenAtlas {
  /** The gateway URL this client calls, without a trailing slash. */
  readonly baseURL: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly normalize: boolean;

  constructor(options: OpenAtlasOptions = {}) {
    const apiKey = options.apiKey ?? env("OPENATLAS_API_KEY");
    if (!apiKey) throw new OpenAtlasError("Missing API key: pass `apiKey` or set OPENATLAS_API_KEY.");
    const baseURL = options.baseURL ?? env("OPENATLAS_BASE_URL") ?? DEFAULT_BASE_URL;
    if (!baseURL) throw new OpenAtlasError("Missing gateway URL: pass `baseURL` or set OPENATLAS_BASE_URL.");

    this.apiKey = apiKey;
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.maxRetries = options.maxRetries ?? 2;
    // Wrapped so fetch is never called with the client as `this` (Workers and browsers throw "Illegal invocation").
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.normalize = options.normalize ?? false;
  }

  /**
   * Text generation with the N-ATLaS LLM (`NCAIR1/N-ATLaS`, a Llama-3 8B fine-tune for English, Hausa,
   * Yoruba and Igbo). Pass the whole conversation each time; the gateway keeps no history.
   *
   * @param params.messages The conversation, oldest first. Must not be empty.
   * @param params.language Optional: asks for the reply in this language (adds an instruction; same model).
   * @param params.user Required: stable, opaque ID of your end user (license-cap counting).
   * @returns The reply, the model ID and the "Powered by Awarri" attribution to show with it.
   * @throws {OpenAtlasError} Empty `messages`, unsupported `language` or missing `user`, before any request.
   * @throws {OpenAtlasAPIError} E.g. `invalid_api_key` (401), `license_cap_reached` (429), `upstream_timeout` (504).
   *
   * @example
   * ```ts
   * const { content } = await client.chat({ messages: [{ role: "user", content: "Kedu?" }], language: "ig", user: id });
   * ```
   */
  async chat(params: ChatParams): Promise<ChatResponse> {
    if (!Array.isArray(params?.messages) || params.messages.length === 0) {
      throw new OpenAtlasError("chat() needs a non-empty `messages` array.");
    }
    if (params.language && !CHAT_LANGUAGES.has(params.language)) {
      throw new OpenAtlasError(`Unsupported chat language "${params.language}". Use one of: en, ha, yo, ig.`);
    }
    requireUser(params.user);
    if (!this.normalize) return this.post<ChatResponse>("/v1/chat/completions", params);
    const opts = { language: params.language };
    const messages = params.messages.map((m) => ({ ...m, content: normalizeText(m.content, opts) }));
    const res = await this.post<ChatResponse>("/v1/chat/completions", { ...params, messages });
    return { ...res, content: normalizeText(res.content, opts) };
  }

  /**
   * Speech to text with the N-ATLaS ASR model for `language` (Whisper-small fine-tunes: `NCAIR1/Hausa-ASR`,
   * `NCAIR1/Yoruba-ASR`, `NCAIR1/Igbo-ASR`, `NCAIR1/NigerianAccentedEnglish`).
   *
   * Up to 30 s per call is the reliable range. Longer audio is cut into 25 s pieces by the backend, but long
   * free speech can still lose words, so split long recordings yourself.
   *
   * @param params.audio Bytes, a base64 string or a Blob/File (browser recordings: webm and m4a work). About 7 MB at most.
   * @param params.language The language being spoken: `"en-ng"`, `"ha"`, `"yo"` or `"ig"`.
   * @param params.user Required: stable, opaque ID of your end user.
   * @returns The transcript, the model ID and the "Powered by Awarri" attribution.
   * @throws {OpenAtlasError} Unsupported `language`, missing `user`, empty or oversized audio, before any request.
   * @throws {OpenAtlasAPIError} E.g. `invalid_audio` (400, audio that can't be decoded), `audio_too_large` (413).
   *
   * @example
   * ```ts
   * const { text } = await client.transcribe({ audio: await readFile("note.ogg"), language: "yo", user: id });
   * ```
   */
  async transcribe(params: TranscribeParams): Promise<TranscribeResponse> {
    if (!TRANSCRIBE_LANGUAGES.has(params?.language)) {
      throw new OpenAtlasError(`Unsupported transcription language "${params?.language}". Use one of: en-ng, ha, yo, ig.`);
    }
    requireUser(params.user);
    const audio = toBase64(await readAudio(params.audio));
    if (audio.length === 0) throw new OpenAtlasError("transcribe() got empty audio.");
    if (audio.length > MAX_AUDIO_BASE64_CHARS) throw audioTooLarge(audio.length);
    const res = await this.post<TranscribeResponse>("/v1/audio/transcriptions", {
      audio,
      language: params.language,
      user: params.user,
    });
    return this.normalize ? { ...res, text: normalizeText(res.text, { language: params.language }) } : res;
  }

  /**
   * Text to speech: renders text (normally N-ATLaS's own reply) as WAV audio. A separate, final-stage renderer
   * (SoroTTS / Meta MMS-TTS), not an N-ATLaS model: it never reasons, translates or transcribes.
   *
   * Quality differs by language: English is clear; Hausa, Yoruba and Igbo are experimental (measured in
   * docs/REPORT.md, KI-14). Optional on the gateway.
   *
   * @param params.text Up to 1,000 characters. Split into sentences and rendered one by one.
   * @param params.language `"en"`, `"ha"`, `"yo"`, `"ig"` or `"pcm"` (Nigerian Pidgin).
   * @param params.engine `"auto"` (default), `"sorotts"` or `"mms"`; see {@link SpeakParams.engine}.
   * @param params.user Required: stable, opaque ID of your end user.
   * @returns WAV bytes plus the engine, model, voice and license credit actually used.
   * @throws {OpenAtlasError} Unsupported `language` or `engine`, empty or too-long `text`, missing `user`.
   * @throws {OpenAtlasAPIError} `tts_disabled` (404) when the gateway has speech off; `tts_unsupported_backend` (501).
   *
   * @example
   * ```ts
   * const { audio } = await client.speak({ text: content, language: "en", user: id });
   * await writeFile("reply.wav", audio);
   * ```
   */
  async speak(params: SpeakParams): Promise<SpeakResponse> {
    if (!SPEAK_LANGUAGES.has(params?.language)) {
      throw new OpenAtlasError(`Unsupported speech language "${params?.language}". Use one of: en, ha, yo, ig, pcm.`);
    }
    if (typeof params.text !== "string" || params.text.trim() === "") throw new OpenAtlasError("speak() needs non-empty `text`.");
    if (params.text.length > MAX_SPEAK_CHARS) throw new OpenAtlasError(`speak() takes up to ${MAX_SPEAK_CHARS} characters; split longer text.`);
    if (params.engine !== undefined && !["auto", "sorotts", "mms"].includes(params.engine)) {
      throw new OpenAtlasError('`engine` must be "auto", "sorotts" or "mms".');
    }
    requireUser(params.user);
    const res = await this.post<Omit<SpeakResponse, "audio"> & { audio: string }>("/v1/audio/speech", {
      text: params.text,
      language: params.language,
      engine: params.engine ?? "auto",
      user: params.user,
    });
    return { ...res, audio: fromBase64(res.audio) };
  }

  /** Repairs corrupted Nigerian-language characters. Local; same as the standalone `normalizeText()`. */
  normalizeText(text: string, options?: NormalizeOptions): string {
    return normalizeText(text, options);
  }

  /**
   * Flag a wrong N-ATLaS output with its correction. Stored by OpenAtlas as an exportable
   * correction dataset. Nothing is recorded unless you call this, so tell your users when you do.
   */
  async reportIssue(params: ReportIssueParams): Promise<ReportIssueResponse> {
    if (params?.kind !== "chat" && params?.kind !== "transcription") {
      throw new OpenAtlasError('reportIssue() needs `kind`: "chat" or "transcription".');
    }
    for (const field of ["output", "correction"] as const) {
      if (typeof params[field] !== "string" || params[field].trim() === "") {
        throw new OpenAtlasError(`reportIssue() needs \`${field}\` (a non-empty string).`);
      }
    }
    if (params.kind === "chat" && !params.input) {
      throw new OpenAtlasError("reportIssue() needs `input` (the prompt) for chat issues.");
    }
    if (params.audio !== undefined && params.kind !== "transcription") {
      throw new OpenAtlasError("reportIssue() accepts `audio` only for transcription issues.");
    }
    const { audio, ...rest } = params;
    return this.post<ReportIssueResponse>("/v1/issues", audio === undefined ? rest : { ...rest, audio: toBase64(await readAudio(audio)) });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(this.baseURL + path, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (controller.signal.aborted) throw new OpenAtlasTimeoutError(this.timeoutMs);
        lastError = new OpenAtlasConnectionError(this.baseURL, err);
        continue;
      }
      clearTimeout(timer);

      const payload = (await res.json().catch(() => null)) as any;
      if (res.ok) return payload as T;

      const error = new OpenAtlasAPIError(
        res.status,
        payload?.error?.code ?? "http_error",
        payload?.error?.message ?? res.statusText ?? "Request failed",
        payload?.error?.job_id,
      );
      if (res.status !== 503) throw error;
      lastError = error;
    }
    throw lastError;
  }
}

function requireUser(user: unknown) {
  if (typeof user !== "string" || user.trim() === "") {
    throw new OpenAtlasError(
      "`user` is required: pass a stable, opaque ID for the end user of your app. " +
        "It is hashed and used only to count active users against the N-ATLaS license cap (1,000 per 30 days).",
    );
  }
}

/** The gateway's limit on base64 audio (about 7 MB of audio). */
const MAX_AUDIO_BASE64_CHARS = 9_500_000;

function audioTooLarge(chars: number) {
  const mb = ((chars * 3) / 4 / 1e6).toFixed(1);
  return new OpenAtlasError(
    `Audio is ${mb} MB; the limit is about 7 MB. Send compressed audio (mp3/ogg) or 16 kHz mono WAV, ` +
      `which is what the speech models use anyway (about 32 KB per second).`,
  );
}

/** Blobs and Files (browser recordings, file inputs) are read into bytes; everything else passes through. */
async function readAudio(audio: AudioInput): Promise<Exclude<AudioInput, Blob>> {
  return typeof Blob !== "undefined" && audio instanceof Blob ? new Uint8Array(await audio.arrayBuffer()) : (audio as Exclude<AudioInput, Blob>);
}

function toBase64(audio: Exclude<AudioInput, Blob>): string {
  if (typeof audio === "string") return audio.replace(/^data:[^,]*,/, "");
  const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
