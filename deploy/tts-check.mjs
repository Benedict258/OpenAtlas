// Live check of speak() (the optional text-to-speech renderer), through the public gateway with the SDK.
// Real text in: each sentence is N-ATLaS's own reply from chat(). Real audio out: the WAV is decoded,
// measured, saved to test-audio/tts/ (gitignored) for listening, and sent back through the N-ATLaS ASR
// model for that language with transcribe(): the word error rate against the text that was spoken is
// an intelligibility check that doesn't depend on anyone's ear.
//
// Usage (repo root): node --env-file=.env deploy/tts-check.mjs [--engines auto,mms] [--langs ha,yo,ig,pcm,en]

import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { OpenAtlas, normalizeText } from "../packages/sdk/dist/index.js";

const gateway = process.env.OPENATLAS_BASE_URL;
const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_TEST_KEY, baseURL: gateway, maxRetries: 0, timeoutMs: 600_000 });
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1].split(",") : dflt; };
const ENGINES = arg("--engines", ["auto", "mms"]);
const LANGS = arg("--langs", ["ha", "yo", "ig", "pcm", "en"]);
const user = "tts-check";
mkdirSync("test-audio/tts", { recursive: true });

const health = await fetch(`${gateway}/v1/health`).then((r) => r.json());
console.log("gateway health:", JSON.stringify(health));
if (health.backend?.mock) throw new Error("Gateway is pointed at the MOCK backend.");
const RUN = { at: new Date().toISOString(), backend_host: health.backend?.host };

// Prompts that make N-ATLaS write a short customer-service reply in each language.
const PROMPTS = {
  ha: { language: "ha", content: "Rubuta gajeriyar amsa (jimloli biyu) ga abokin ciniki wanda kayansa bai iso ba." },
  yo: { language: "yo", content: "Kọ ìdáhùn kúkúrú (gbólóhùn méjì) sí oníbàárà tí ọjà rẹ̀ kò tíì dé." },
  ig: { language: "ig", content: "Dee nzaghachi dị mkpirikpi (ahịrịokwu abụọ) nye onye ahịa ngwaahịa ya erubeghị." },
  en: { language: "en", content: "Write a short reply (two sentences) to a customer whose order has not arrived." },
  // N-ATLaS isn't tuned for Pidgin; ask in English and say which language to write in.
  pcm: { language: undefined, content: "Write a short reply (two sentences) in Nigerian Pidgin to a customer whose order has not arrived." },
};
const ASR_FOR = { ha: "ha", yo: "yo", ig: "ig", en: "en-ng", pcm: "en-ng" }; // no Pidgin ASR model: the Nigerian-English one is the closest

function words(s) {
  return normalizeText(s).normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
}
const stripMarks = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
function wer(ref, hyp) {
  const r = words(ref), h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}
function wavInfo(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return { valid: false };
  const rate = v.getUint32(24, true), channels = v.getUint16(22, true), bits = v.getUint16(34, true), dataBytes = v.getUint32(40, true);
  let peak = 0;
  for (let i = 44; i + 1 < bytes.length; i += 2) peak = Math.max(peak, Math.abs(v.getInt16(i, true)));
  return { valid: true, rate, channels, bits, seconds: +(dataBytes / (rate * channels * (bits / 8))).toFixed(2), peak: +(peak / 32767).toFixed(2) };
}

let failures = 0;
for (const lang of LANGS) {
  const p = PROMPTS[lang];
  let t0 = Date.now();
  const reply = await client.chat({ messages: [{ role: "system", content: "Reply in at most two short sentences." }, { role: "user", content: p.content }], language: p.language, max_tokens: 120, user });
  const text = reply.content.trim();
  console.log(`\n=== ${lang}: N-ATLaS text (${((Date.now() - t0) / 1000).toFixed(1)} s): ${text}`);
  for (const engine of ENGINES) {
    t0 = Date.now();
    let s;
    try {
      s = await client.speak({ text, language: lang, engine, user });
    } catch (e) {
      failures++;
      console.log(`  [${engine}] FAIL ${e.code ?? e.name}: ${e.message}`);
      appendFileSync("deploy/tts-results.jsonl", JSON.stringify({ ...RUN, lang, engine, text, error: `${e.code ?? e.name}: ${e.message}` }) + "\n");
      continue;
    }
    const seconds = (Date.now() - t0) / 1000;
    const info = wavInfo(s.audio);
    const file = `test-audio/tts/${lang}-${s.engine}-${Date.now()}.wav`;
    writeFileSync(file, s.audio);
    const back = await client.transcribe({ audio: s.audio, language: ASR_FOR[lang], user });
    const w = wer(text, back.text), wNoMarks = wer(stripMarks(text), stripMarks(back.text));
    const ok = info.valid && info.seconds > 0.5 && info.peak > 0.05;
    if (!ok) failures++;
    const row = { ...RUN, lang, engine_requested: engine, engine: s.engine, model: s.model, voice: s.voice, text, request_s: +seconds.toFixed(1), audio_s: info.seconds, rtf: +(seconds / info.seconds).toFixed(2), wav: info, warnings: s.warnings, fallback_reason: s.fallback_reason, attribution: s.attribution, asr_model: back.model, asr_text: back.text, wer: +w.toFixed(3), wer_no_marks: +wNoMarks.toFixed(3), file };
    appendFileSync("deploy/tts-results.jsonl", JSON.stringify(row) + "\n");
    console.log(`  [${engine}] ${ok ? "OK " : "BAD"} ${s.model}${s.voice ? ` (${s.voice})` : ""}: ${info.seconds} s of ${info.rate} Hz audio in ${seconds.toFixed(1)} s (x${row.rtf}), peak ${info.peak}${s.fallback_reason ? `, FELL BACK: ${s.fallback_reason}` : ""}${s.warnings.length ? `, warnings: ${s.warnings.join(" ")}` : ""}`);
    console.log(`         heard back by ${back.model}: "${back.text}"  WER ${(w * 100).toFixed(0)}% (${(wNoMarks * 100).toFixed(0)}% ignoring tone marks)  → ${file}`);
  }
}
console.log(failures ? `\n${failures} failure(s)` : "\nall renders returned valid audio");
process.exit(failures ? 1 : 0);
