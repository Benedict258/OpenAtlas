/**
 * Friendly language names and the per-function code tables from the build spec
 * (section 5.3). The SDK uses different codes in different functions — never
 * send a code from one table to another function.
 */

export interface LangOption {
  code: string;
  name: string;
}

/** chat(), buildPrompt() */
export const CHAT_LANGS: LangOption[] = [
  { code: "en", name: "English" },
  { code: "ha", name: "Hausa" },
  { code: "yo", name: "Yoruba" },
  { code: "ig", name: "Igbo" },
];

/** transcribe() — no auto-detection: the spoken language must be picked. */
export const TRANSCRIBE_LANGS: LangOption[] = [
  { code: "en-ng", name: "Nigerian English" },
  { code: "ha", name: "Hausa" },
  { code: "yo", name: "Yoruba" },
  { code: "ig", name: "Igbo" },
];

/** speak() — "pcm" is Nigerian Pidgin. */
export const SPEAK_LANGS: LangOption[] = [
  { code: "en", name: "English" },
  { code: "ha", name: "Hausa" },
  { code: "yo", name: "Yoruba" },
  { code: "ig", name: "Igbo" },
  { code: "pcm", name: "Nigerian Pidgin" },
];

/** normalizeText(), reportIssue() */
export const TEXT_LANGS: LangOption[] = [
  { code: "en", name: "English" },
  { code: "en-ng", name: "Nigerian English" },
  { code: "ha", name: "Hausa" },
  { code: "yo", name: "Yoruba" },
  { code: "ig", name: "Igbo" },
];

export function langName(codes: LangOption[], code: string): string {
  return codes.find((l) => l.code === code)?.name ?? code;
}
