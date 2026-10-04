// Real end-to-end check through the PUBLIC gateway with the SDK: chat() in four languages,
// transcribe() on real speech clips with human reference transcripts, and reportIssue() + export.
// Records which backend host served the run, so results can't be confused across Colab / NiHub.
//
// Prereqs: gateway pointed at a backend (deploy/set-backend.mjs); clips from scripts/dev/fetch-test-audio.mjs.
// Usage (repo root): node --env-file=.env scripts/smoke-gateway.mjs
// Results are appended to scripts/results/smoke-results.jsonl (gitignored).

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OpenAtlas, normalizeText } from "../sdk/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gateway = process.env.OPENATLAS_BASE_URL;
const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_TEST_KEY, baseURL: gateway, maxRetries: 0 });
const health = await fetch(`${gateway}/v1/health`).then((r) => r.json());
console.log("gateway health:", JSON.stringify(health));
if (health.backend?.mock) throw new Error("Gateway is pointed at the MOCK backend; this script is for real runs only.");
const run = { at: new Date().toISOString(), gateway, backend_host: health.backend?.host ?? health.backend?.kind };
const log = (entry) => {
  appendFileSync(join(root, "scripts", "results", "smoke-results.jsonl"), JSON.stringify({ ...run, ...entry }) + "\n");
};
let failures = 0;

// Word error rate after lowercasing, NFC, and stripping punctuation. Diacritics are kept, so a
// transcript that drops tone marks counts as wrong, which is the honest measure for these languages.
function wer(ref, hyp) {
  const words = (s) => normalizeText(s).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
  const r = words(ref), h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}

const prompts = [
  ["en", "In two sentences, what does the National Identity Management Commission do?"],
  ["ha", "Me ake nufi da kalmar 'gwagwarmaya'? Bayyana a takaice."],
  ["yo", "Ṣàlàyé ní ṣókí: kí ni ìdí tí ojú ọ̀run fi máa ń ṣú bulúù?"],
  ["ig", "Kọwaa n'nkenke: gịnị bụ uru ịsa aka tupu iri nri?"],
];
console.log("\n=== chat()");
for (const [language, content] of prompts) {
  const t0 = Date.now();
  try {
    const r = await client.chat({ messages: [{ role: "user", content }], language, max_tokens: 200, user: "owner-smoke-test" });
    const secs = (Date.now() - t0) / 1000;
    console.log(`[${language}] ${secs.toFixed(1)}s  ${JSON.stringify(r.usage)}\n  Q: ${content}\n  A: ${r.content}\n`);
    log({ method: "chat", language, ok: true, seconds: secs, prompt: content, output: r.content, usage: r.usage });
  } catch (e) {
    failures++;
    console.log(`[${language}] FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e.message}`);
    log({ method: "chat", language, ok: false, error: e.message });
  }
}

console.log("=== transcribe()");
const refsPath = join(root, "test-audio", "refs.json");
const refs = existsSync(refsPath) ? JSON.parse(readFileSync(refsPath, "utf8")) : {};
if (!Object.keys(refs).length) console.log("(no clips; run scripts/dev/fetch-test-audio.mjs)");
for (const [language, { file, reference, dataset }] of Object.entries(refs)) {
  const t0 = Date.now();
  try {
    const r = await client.transcribe({ audio: readFileSync(join(root, "test-audio", file)), language, user: "owner-smoke-test" });
    const secs = (Date.now() - t0) / 1000;
    const score = wer(reference, r.text);
    console.log(`[${language}] ${secs.toFixed(1)}s  WER ${(score * 100).toFixed(0)}%  (${dataset})\n  ref: ${reference}\n  hyp: ${r.text}\n`);
    log({ method: "transcribe", language, ok: true, seconds: secs, wer: score, reference, output: r.text, model: r.model, dataset });
  } catch (e) {
    failures++;
    console.log(`[${language}] FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e.message}`);
    log({ method: "transcribe", language, ok: false, error: e.message });
  }
}

console.log("=== reportIssue() + operator export");
try {
  // Margin for clock skew: the Worker's timestamp can trail this machine's clock.
  const since = Date.now() - 60_000;
  const r = await client.reportIssue({ kind: "chat", input: "smoke test", output: "smoke test output", correction: "smoke test correction", language: "en", note: "scripts/smoke-gateway.mjs, safe to ignore" });
  const exp = await fetch(`${gateway}/v1/admin/issues?since=${since}`, { headers: { Authorization: `Bearer ${process.env.OPENATLAS_ADMIN_TOKEN}` } }).then((x) => x.json());
  const found = exp.issues?.some((i) => i.id === r.id);
  console.log(`stored ${r.id}; present in admin export: ${found}`);
  if (!found) failures++;
  log({ method: "reportIssue", ok: found, id: r.id });
} catch (e) {
  failures++;
  console.log(`FAILED: ${e.message}`);
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : "All calls succeeded"} — backend: ${run.backend_host}`);
process.exit(failures ? 1 : 0);
