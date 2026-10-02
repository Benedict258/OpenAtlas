import { OpenAtlasAPIError, OpenAtlasConnectionError, OpenAtlasError, OpenAtlasTimeoutError } from "./errors.js";
import type { AudioInput, ChatParams, ChatResponse, TranscribeParams, TranscribeResponse } from "./types.js";

const CHAT_LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const TRANSCRIBE_LANGUAGES = new Set(["en-ng", "ha", "yo", "ig"]);

/**
 * Public gateway URL. Filled in once the gateway is deployed; until then pass `baseURL`
 * or set `OPENATLAS_BASE_URL`.
 */
export const DEFAULT_BASE_URL: string | undefined = undefined;

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
  /** Retries for network errors and 502/503 responses. Default 2. Never retries 4xx. */
  maxRetries?: number;
  /** Custom fetch implementation (tests, proxies). */
  fetch?: typeof fetch;
}

const env = (name: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[name] : undefined;

export class OpenAtlas {
  readonly baseURL: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAtlasOptions = {}) {
    const apiKey = options.apiKey ?? env("OPENATLAS_API_KEY");
    if (!apiKey) throw new OpenAtlasError("Missing API key: pass `apiKey` or set OPENATLAS_API_KEY.");
    const baseURL = options.baseURL ?? env("OPENATLAS_BASE_URL") ?? DEFAULT_BASE_URL;
    if (!baseURL) throw new OpenAtlasError("Missing gateway URL: pass `baseURL` or set OPENATLAS_BASE_URL.");

    this.apiKey = apiKey;
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
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
    return this.post<ChatResponse>("/v1/chat/completions", params);
  }

  /** Speech-to-text with the N-ATLaS ASR model for `language`. */
  async transcribe(params: TranscribeParams): Promise<TranscribeResponse> {
    if (!TRANSCRIBE_LANGUAGES.has(params?.language)) {
      throw new OpenAtlasError(`Unsupported transcription language "${params?.language}". Use one of: en-ng, ha, yo, ig.`);
    }
    requireUser(params.user);
    return this.post<TranscribeResponse>("/v1/audio/transcriptions", {
      audio: toBase64(params.audio),
      language: params.language,
      user: params.user,
    });
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
      if (res.status !== 502 && res.status !== 503) throw error;
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

function toBase64(audio: AudioInput): string {
  if (typeof audio === "string") return audio.replace(/^data:[^,]*,/, "");
  const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
