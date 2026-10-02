// Multi-clip ASR evaluation through the PUBLIC path: SDK transcribe() → live gateway → backend.
// Reads test-audio/eval/manifest.json (dev/fetch-asr-eval.mjs, then dev/resample-eval.py) and reports
// corpus WER per language, both with diacritics (tone marks count) and without them.
//
// Usage (repo root): node --env-file=.env deploy/asr-eval.mjs
// Each clip's result is appended to deploy/smoke-results.jsonl (gitignored) with tag "asr-eval".

import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OpenAtlas, normalizeText } from "../packages/sdk/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evalDir = join(root, "test-audio", "eval");
const gateway = process.env.OPENATLAS_BASE_URL;
const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_TEST_KEY, baseURL: gateway, maxRetries: 1 });
const health = await fetch(`${gateway}/v1/health`).then((r) => r.json());
if (health.backend?.mock) throw new Error("Gateway is pointed at the MOCK backend; this script is for real runs only.");
const run = { at: new Date().toISOString(), tag: "asr-eval", gateway, backend_host: health.backend?.host };
console.log("backend:", run.backend_host);

const words = (s, keepMarks) => {
  let t = normalizeText(s).toLowerCase();
  if (!keepMarks) t = t.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  return t.replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
};
// Word-level edit distance.
function edits(r, h) {
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[h.length];
}

const clips = JSON.parse(readFileSync(join(evalDir, "manifest.json"), "utf8"));
const only = process.argv[2];
const results = [];
for (const clip of clips.filter((c) => !only || c.language === only)) {
  const t0 = Date.now();
  try {
    const r = await client.transcribe({ audio: readFileSync(join(evalDir, clip.file_16k)), language: clip.language, user: "owner-asr-eval" });
    const secs = (Date.now() - t0) / 1000;
    const res = { ...clip, ok: true, seconds: secs, hypothesis: r.text };
    for (const keep of [true, false]) {
      const ref = words(clip.reference, keep), hyp = words(r.text, keep);
      res[keep ? "marks" : "plain"] = { errors: edits(ref, hyp), ref_words: ref.length, hyp_words: hyp.length };
    }
    results.push(res);
    const m = res.marks;
    console.log(`[${clip.language}] ${clip.measured_s}s audio, ${secs.toFixed(1)}s  WER ${((100 * m.errors) / m.ref_words).toFixed(0)}%  words ref/hyp ${m.ref_words}/${m.hyp_words}  ${clip.file}`);
    appendFileSync(join(root, "deploy", "smoke-results.jsonl"), JSON.stringify({ ...run, method: "transcribe", ...res }) + "\n");
  } catch (e) {
    results.push({ ...clip, ok: false, error: e.message });
    console.log(`[${clip.language}] FAILED ${clip.file}: ${e.message}`);
    appendFileSync(join(root, "deploy", "smoke-results.jsonl"), JSON.stringify({ ...run, method: "transcribe", ...clip, ok: false, error: e.message }) + "\n");
  }
}

const pct = (e, n) => (n ? ((100 * e) / n).toFixed(1) + "%" : "n/a");
const sum = (rs, k, f) => rs.reduce((a, r) => a + r[k][f], 0);
console.log("\nlanguage | clips ok | corpus WER (tone marks count) | corpus WER (marks ignored) | ≤30 s clips | >30 s clips | median time");
for (const lang of [...new Set(results.map((r) => r.language))]) {
  const all = results.filter((r) => r.language === lang);
  const ok = all.filter((r) => r.ok);
  const short = ok.filter((r) => r.measured_s <= 30), long = ok.filter((r) => r.measured_s > 30);
  const times = ok.map((r) => r.seconds).sort((a, b) => a - b);
  console.log(
    `${lang} | ${ok.length}/${all.length} | ${pct(sum(ok, "marks", "errors"), sum(ok, "marks", "ref_words"))} | ${pct(sum(ok, "plain", "errors"), sum(ok, "plain", "ref_words"))} | ` +
      `${short.length ? pct(sum(short, "marks", "errors"), sum(short, "marks", "ref_words")) + ` (${short.length})` : "-"} | ` +
      `${long.length ? pct(sum(long, "marks", "errors"), sum(long, "marks", "ref_words")) + ` (${long.length})` : "-"} | ${times.length ? times[Math.floor(times.length / 2)].toFixed(1) + " s" : "-"}`,
  );
}
