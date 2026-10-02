/**
 * Deterministic cleanup for Nigerian-language text. No model, no network.
 *
 * Repairs characters that were *corrupted* on the way in (typing, copy-paste, scraping).
 * It does not add tone marks or dot-below marks that were never typed: that is a modelling
 * problem (see Orife 2018; Ezeani et al. 2016) and out of scope here.
 */

export type NormalizeLanguage = "en" | "en-ng" | "ha" | "yo" | "ig";

export interface NormalizeOptions {
  /**
   * Enables the language-specific repairs. Without it only the language-neutral steps run
   * (invisible characters, encoding repair, Unicode NFC).
   */
  language?: NormalizeLanguage;
  /**
   * Hausa only: convert the ASCII apostrophe conventions for hooked letters before a vowel
   * (`k'asa` → `ƙasa`, `d'aya` → `ɗaya`, `'bata` → `ɓata`). Off by default, because apostrophes
   * also appear as quotation marks and in `'y` (which standard Nigerian Hausa keeps as written).
   */
  hausaApostrophes?: boolean;
}

// Zero-width space/non-joiner/joiner, word joiner, BOM, soft hyphen. None belong in Latin-script
// Hausa, Yoruba, Igbo, or English text; they break matching and tokenisation.
const INVISIBLE = /[​‌‍⁠﻿­]/g;

// Windows-1252 code points for bytes 0x80–0x9F (the rest of 0x80–0xFF map to U+0080–U+00FF).
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
// A character that UTF-8 continuation bytes (0x80–0xBF) turn into when mis-decoded as cp1252/Latin-1.
const CONT = "[\\u0080-\\u00BF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC\\u2013\\u2014\\u2018-\\u201A\\u201C-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122]";
// Lead byte 0xC2–0xDF + 1 continuation, or 0xE0–0xEF + 2 continuations.
const MOJIBAKE = new RegExp(`[\\u00C2-\\u00DF]${CONT}|[\\u00E0-\\u00EF]${CONT}{2}`, "g");
const utf8 = new TextDecoder("utf-8", { fatal: true });

/** "á»\u008D" → "ọ": undo UTF-8 text that was decoded as Windows-1252 or Latin-1. */
function repairMojibake(text: string): string {
  return text.replace(MOJIBAKE, (seq) => {
    const bytes = [...seq].map((ch) => {
      const cp = ch.codePointAt(0)!;
      return cp <= 0xff ? cp : CP1252_HIGH[cp];
    });
    try {
      return utf8.decode(new Uint8Array(bytes));
    } catch {
      return seq; // not valid UTF-8 after all: leave it alone
    }
  });
}

// Hausa hooked letters typed with look-alikes from other keyboards/fonts.
const HAUSA_LOOKALIKES: Record<string, string> = {
  "ķ": "ƙ", "Ķ": "Ƙ", // k with cedilla (Latvian keyboards)
  "ɖ": "ɗ", "Ɖ": "Ɗ", // African/Ewe d (tail) for Hausa hooked d
  "ƃ": "ɓ", "Ƃ": "Ɓ", // b with topbar
};
const HAUSA_HOOK: Record<string, string> = { b: "ɓ", B: "Ɓ", d: "ɗ", D: "Ɗ", k: "ƙ", K: "Ƙ" };
const APOS = "['’ʼ]";
const VOWEL_AHEAD = "(?=[aeiouAEIOUÀ-ÿ])";
const HAUSA_APOS_AFTER = new RegExp(`([bBdDkK])${APOS}${VOWEL_AHEAD}`, "g"); // k'asa
const HAUSA_APOS_BEFORE = new RegExp(`(^|[^\\p{L}])${APOS}([bBdD])${VOWEL_AHEAD}`, "gu"); // 'bata

// Yoruba/Igbo: cedilla or ogonek used in place of the dot below (e.g. Turkish "ş" for "ṣ").
const DOT_BELOW_BASES: Record<string, string> = { yo: "eEoOsS", ig: "iIoOuU" };

export function normalizeText(text: string, options: NormalizeOptions = {}): string {
  if (typeof text !== "string") throw new TypeError("normalizeText() expects a string.");
  const { language, hausaApostrophes = false } = options;

  // Encoding repair first: NBSP and soft hyphen are also mis-decoded UTF-8 continuation
  // bytes (e.g. "à" → "Ã" + NBSP), so stripping them first would destroy the evidence.
  let out = repairMojibake(text);
  out = out.replace(INVISIBLE, "").replace(/ /g, " ");

  if (language === "ha") {
    out = out.replace(/[ķĶɖƉƃƂ]/g, (ch) => HAUSA_LOOKALIKES[ch]);
    if (hausaApostrophes) {
      out = out
        .replace(HAUSA_APOS_AFTER, (_, letter: string) => HAUSA_HOOK[letter])
        .replace(HAUSA_APOS_BEFORE, (_, before: string, letter: string) => before + HAUSA_HOOK[letter]);
    }
  }

  const bases = DOT_BELOW_BASES[language ?? ""];
  if (bases) {
    // Decompose so precomposed "ş"/"ę" become base + combining cedilla/ogonek, swap in the
    // combining dot below, then recompose. Tone marks on the same letter are preserved.
    const swap = new RegExp(`([${bases}][\\u0300-\\u036F]*?)[\\u0327\\u0328]`, "g");
    out = out.normalize("NFD").replace(swap, "$1̣");
  }

  return out.normalize("NFC");
}
