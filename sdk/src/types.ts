/** Languages the N-ATLaS LLM was fine-tuned on: English, Hausa, Yoruba, Igbo. */
export type ChatLanguage = "en" | "ha" | "yo" | "ig";

/**
 * One code per N-ATLaS speech-recognition model: `"en-ng"` is Nigerian-accented English
 * (`NCAIR1/NigerianAccentedEnglish`), the others are `NCAIR1/Hausa-ASR`, `NCAIR1/Yoruba-ASR`, `NCAIR1/Igbo-ASR`.
 */
export type TranscribeLanguage = "en-ng" | "ha" | "yo" | "ig";

/** The Hugging Face ID of the model that answered `chat()`. There is one LLM for all four languages. */
export type ChatModel = "NCAIR1/N-ATLaS";

/** The Hugging Face ID of the N-ATLaS speech-recognition model that served `transcribe()`. */
export type TranscribeModel = "NCAIR1/Hausa-ASR" | "NCAIR1/Yoruba-ASR" | "NCAIR1/Igbo-ASR" | "NCAIR1/NigerianAccentedEnglish";

/** One turn of a conversation, in the OpenAI-style shape the N-ATLaS chat template expects. */
export interface ChatMessage {
  /** `"system"` sets instructions, `"user"` is your user's turn, `"assistant"` is an earlier model reply. */
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
  /** The model's reply, trimmed. Run through `normalizeText()` first if the client was created with `normalize: true`. */
  content: string;
  /** The model's Hugging Face ID. */
  model: ChatModel;
  /** "Powered by Awarri", the attribution N-ATLaS's terms require. Show it where you show model output. */
  attribution: string;
  /** Token counts, when the backend reports them. */
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Raw bytes, a base64 string (a `data:` URL prefix is stripped), or a Blob/File (e.g. a browser recording).
 * Any format ffmpeg decodes, including the webm/m4a browsers record. 30 s or less per request is the
 * reliable range (longer audio is split into 25 s pieces by the backend).
 */
export type AudioInput = Uint8Array | ArrayBuffer | string | Blob;

export interface TranscribeParams {
  /** The recording. About 7 MB at most; 16 kHz mono WAV or compressed audio keeps it small. */
  audio: AudioInput;
  /** Which N-ATLaS ASR model to use. Pick the language being spoken; there is no auto-detection. */
  language: TranscribeLanguage;
  /** Required. Same as `ChatParams.user`. */
  user: string;
}

export interface TranscribeResponse {
  /** The transcript. Run through `normalizeText()` first if the client was created with `normalize: true`. */
  text: string;
  language: TranscribeLanguage;
  /** The ASR model's Hugging Face ID. */
  model: TranscribeModel;
  /** "Powered by Awarri", the attribution N-ATLaS's terms require. */
  attribution: string;
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

/** Languages the optional speech renderer covers ("pcm" is Nigerian Pidgin). */
export type SpeakLanguage = "en" | "ha" | "yo" | "ig" | "pcm";

export interface SpeakParams {
  /**
   * Text to speak, up to 1,000 characters: normally N-ATLaS's own reply. speak() only renders it as audio;
   * it never changes, translates or answers it. Yoruba and Igbo sound best with tone marks and dots,
   * Hausa with its hooked letters (ɓ ɗ ƙ).
   */
  text: string;
  language: SpeakLanguage;
  /**
   * - `"auto"` (default): SoroTTS for a single sentence where it covers the language and is loaded; MMS-TTS
   *   for longer text, for English, or if SoroTTS fails. SoroTTS renders slower than real time, so whole
   *   replies go to MMS-TTS.
   * - `"sorotts"`: SoroTTS only (ha, yo, ig, pcm). More natural, slow.
   * - `"mms"`: Meta MMS-TTS only. Fast, more robotic. Clear in English; much less accurate in ha/yo/ig.
   */
  engine?: "auto" | "sorotts" | "mms";
  /** Required. Same as `ChatParams.user`. */
  user: string;
}

export interface SpeakResponse {
  /** The speech as WAV bytes (16-bit mono PCM). In a browser: `new Blob([audio], { type: "audio/wav" })`. */
  audio: Uint8Array;
  format: "wav";
  /** 24 000 for SoroTTS, 16 000 for MMS-TTS. */
  sample_rate: number;
  /** Length of the audio in seconds. */
  seconds: number;
  language: SpeakLanguage;
  /** The engine that actually rendered it. */
  engine: "sorotts" | "mms";
  /** The TTS model's Hugging Face ID, e.g. "Shinzmann/sorotts" or "facebook/mms-tts-hau". Not an N-ATLaS model. */
  model: string;
  /** SoroTTS voice used (e.g. "Hau1"), or `null` for MMS-TTS. */
  voice: string | null;
  /** How many sentences the text was split into; each is rendered separately and joined with a short pause. */
  sentences: number;
  /** E.g. a sentence that hit SoroTTS's length limit (its audio may be cut off there). */
  warnings: string[];
  /** Set when "auto" fell back from SoroTTS to MMS-TTS, with the reason. */
  fallback_reason?: string;
  /** The TTS model's license credit. Show it with the audio, next to N-ATLaS's "Powered by Awarri". */
  attribution: string;
}
