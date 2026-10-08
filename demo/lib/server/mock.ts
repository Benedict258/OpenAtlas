/**
 * Canned responses for building the UI while the GPU is off (build spec section 9).
 * Every string is visibly marked so mock output can never be mistaken for real
 * N-ATLaS output. Never enable DEMO_MOCK in the deployed app or while recording.
 */

export const MOCK_MARK = "[MOCK — not N-ATLaS output] ";

export function mockChat(text: string) {
  return {
    content: `${MOCK_MARK}You said: ${text}`,
    model: "NCAIR1/N-ATLaS" as const,
    attribution: "Powered by Awarri",
    usage: { prompt_tokens: 12, completion_tokens: 24, total_tokens: 36 },
  };
}

export function mockTranscribe(language: string) {
  return {
    text: `${MOCK_MARK}This is a mock transcript for language "${language}".`,
    language: language as "en-ng" | "ha" | "yo" | "ig",
    model: "NCAIR1/Hausa-ASR" as const,
    attribution: "Powered by Awarri",
  };
}

/** 0.6 s of silence as a tiny WAV (44-byte header + 0 samples at 8 kHz, 8-bit mono). */
const SILENT_WAV = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x40, 0x1f, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00,
  0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
]);

export function mockSpeak(language: string) {
  return {
    audio: SILENT_WAV,
    format: "wav" as const,
    sample_rate: 8000,
    seconds: 0.6,
    language: language as "en" | "ha" | "yo" | "ig" | "pcm",
    engine: "mms" as const,
    model: "mock/tts",
    voice: null,
    sentences: 1,
    warnings: [`${MOCK_MARK}silent placeholder audio`],
    attribution: `${MOCK_MARK}speech engine credit not shown in mock mode`,
  };
}

export function mockReportIssue() {
  return {
    id: "mock-issue-0000",
    received_at: new Date().toISOString(),
  };
}
