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
export type AudioInput = Uint8Array | ArrayBuffer | string;

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
