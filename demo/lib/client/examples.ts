/**
 * Example inputs for the text cleaner, built by taking known-good text and
 * corrupting it the same way scraping/copy-paste does (the corruption functions
 * are the ones the SDK's own test suite uses). The "after" side is whatever
 * normalizeText() actually returns — nothing here is pre-baked output.
 */

/** UTF-8 bytes decoded as Windows-1252 (the usual browser/Excel default). */
const CP1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘",
  0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜",
  0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

export function corruptCp1252(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (const b of bytes) out += CP1252[b] ?? String.fromCharCode(b);
  return out;
}

export interface CleanerExample {
  label: string;
  text: string;
  language?: string;
  hausaApostrophes?: boolean;
}

const SAMPLES: Record<string, string> = {
  ha: "Ƙasar Najeriya tana da ɗimbin al'umma; ɓarna ba ta da kyau.",
  yo: "Ọmọ mi, ṣé o ti jẹun? Ẹ kú àárọ̀.",
  ig: "Ị nọ n'ụlọ akwụkwọ? Anyị na-asụ Igbo.",
  en: "The candidate's résumé — café, naïve, fiancée.",
  "en-ng": "The candidate's résumé — café, naïve, fiancée.",
};

export function examplesFor(language: string): CleanerExample[] {
  const out: CleanerExample[] = [];

  const sample = SAMPLES[language];
  if (sample) {
    out.push({
      label: `Example: broken text (mojibake, ${language})`,
      text: corruptCp1252(sample),
      language,
    });
  }

  if (language === "ha") {
    out.push({
      label: "Example: look-alike letters (ķasa → ƙasa)",
      text: "ķasa ɖaya ƃarna Ķano",
      language: "ha",
    });
    out.push({
      label: "Example: apostrophes (k'asa → ƙasa)",
      text: "k'asa d'aya 'bata, al'umma, 'ya'ya",
      language: "ha",
      hausaApostrophes: true,
    });
  }
  if (language === "yo") {
    out.push({
      label: "Example: cedilla stand-ins (Şé → Ṣé)",
      text: "Şé o ti jęun? Ǫmǫ",
      language: "yo",
    });
  }
  if (language === "ig") {
    out.push({
      label: "Example: ogonek stand-ins (nǫ → nọ)",
      text: "į nǫ n'ųlǫ",
      language: "ig",
    });
  }

  // Invisible characters: zero-width space + BOM, exactly what the SDK's tests use.
  out.push({ label: "Example: invisible characters", text: "Ọmọ\u200B mi\uFEFF" });
  return out;
}
