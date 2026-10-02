import { OpenAtlasAPIError, OpenAtlasConnectionError, OpenAtlasError, OpenAtlasTimeoutError } from "./errors.js";
import { normalizeText, type NormalizeOptions } from "./normalize.js";
import type {
  AudioInput,
  ChatParams,
  ChatResponse,
  ReportIssueParams,
  ReportIssueResponse,
  TranscribeParams,
  TranscribeResponse,
} from "./types.js";

const CHAT_LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const TRANSCRIBE_LANGUAGES = new Set(["en-ng", "ha", "yo", "ig"]);

/** Public OpenAtlas gateway (Cloudflare Worker). Override with `baseURL` or `OPENATLAS_BASE_URL`. */
export const DEFAULT_BASE_URL: string | undefined = "https://openatlas-gateway.isaacbenedict001.workers.dev";

export interface OpenAtlasOptions {
  /** Defaults to `process.env.OPENATLAS_API_KEY`. */
  apiKey?: string;
  /** Defaults to `process.env.OPENATLAS_BASE_URL`, then the hosted gateway. */
  baseURL?: string;
  /**
   * Per-request timeout. Default 300 000 ms (5 min), because a cold start on the
   * scaled-to-zero endpoint includes loading the model.
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

const env = (name: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[name] : undefined;

export class OpenAtlas {
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

  /** Text reasoning with the N-ATLaS LLM. */
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

  /** Speech-to-text with the N-ATLaS ASR model for `language`. */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
