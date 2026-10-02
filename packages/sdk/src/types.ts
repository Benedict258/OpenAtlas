/** Languages N-ATLaS's LLM was fine-tuned on. */
export type ChatLanguage = "en" | "ha" | "yo" | "ig";

/** One code per N-ATLaS ASR model. */
export type TranscribeLanguage = "en-ng" | "ha" | "yo" | "ig";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatParams {
  messages: ChatMessage[];
  /**
   * Language to answer in. Adds a short instruction to the system prompt; it does not
   * switch models (there is one N-ATLaS LLM for all four languages).
   */
  language?: ChatLanguage;
  /** Default 512, capped at 1024 by the gateway. */
  max_tokens?: number;
  /** Default 0.1. */
  temperature?: number;
  /**
   * Required. Stable, opaque ID for the end user of your app (max 256 chars). Used only to
   * count active users against the N-ATLaS license cap; hashed before storage.
   */
  user: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/** Raw audio bytes, or a base64 string (no `data:` prefix). Any format ffmpeg can decode: wav, mp3, ogg, webm, m4a. */
/** Raw bytes, a base64 string (a `data:` URL prefix is stripped), or a Blob/File (e.g. a browser recording). */
export type AudioInput = Uint8Array | ArrayBuffer | string | Blob;

export interface TranscribeParams {
  audio: AudioInput;
  language: TranscribeLanguage;
  /** Required. Same as `ChatParams.user`. */
  user: string;
}

export interface TranscribeResponse {
  text: string;
  language: TranscribeLanguage;
  model: string;
}

export interface ReportIssueParams {
  /** Which N-ATLaS output was wrong. */
  kind: "chat" | "transcription";
  /** What N-ATLaS returned. */
  output: string;
  /** What it should have been. */
  correction: string;
  /** The prompt that produced the output. Required for `chat`; optional for `transcription`. */
  input?: string;
  /** Language of the text: en, en-ng, ha, yo, ig. */
  language?: "en" | "en-ng" | "ha" | "yo" | "ig";
  /** Free-text context, up to 2,000 characters. */
  note?: string;
  /**
   * Transcription issues only: the audio clip, so the corrected transcript can be paired with it.
   * Up to ~1 MB once base64-encoded (roughly 30 s of compressed speech).
   */
  audio?: AudioInput;
  /** Optional end-user ID; hashed before storage, like `ChatParams.user`. */
  user?: string;
}

export interface ReportIssueResponse {
  id: string;
  received_at: string;
}
