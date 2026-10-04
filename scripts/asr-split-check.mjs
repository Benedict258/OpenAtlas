// KI-11 check: is audio lost at the backend's 30 s chunk boundaries, or does the model drop speech in
// long recordings anyway? Sends each long clip as separate 25 s pieces (no backend chunking involved),
// joins the transcripts, and compares length and WER with the backend-chunked run (tag asr-eval-long-chunked).
// Prereq: test-audio/eval/split-check.json (pieces written by the split step). Usage: node --env-file=.env scripts/asr-split-check.mjs
import { readFileSync } from "node:fs";
import { OpenAtlas, normalizeText } from "../sdk/dist/index.js";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_TEST_KEY, baseURL: process.env.OPENATLAS_BASE_URL, maxRetries: 0 });
const words = (s) => normalizeText(s).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
const edits = (r, h) => {
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[h.length];
};
const chunked = Object.fromEntries(
  readFileSync("scripts/results/smoke-results.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.tag === "asr-eval-long-chunked" && r.ok).map((r) => [r.file, r]),
);
console.log("clip | audio | ref words | backend-chunked: words (ratio) WER | self-split 25 s: words (ratio) WER");
for (const clip of JSON.parse(readFileSync("test-audio/eval/split-check.json", "utf8"))) {
  const texts = [];
  for (const p of clip.parts) texts.push((await client.transcribe({ audio: readFileSync(`test-audio/eval/${p}`), language: clip.language, user: "owner-asr-check" })).text);
  const ref = words(clip.reference), split = words(texts.join(" ")), back = words(chunked[clip.file]?.hypothesis ?? "");
  const f = (h) => `${h.length} (${(h.length / ref.length).toFixed(2)}) ${((100 * edits(ref, h)) / ref.length).toFixed(0)}%`;
  console.log(`${clip.file} | ${clip.measured_s}s | ${ref.length} | ${f(back)} | ${f(split)}`);
}
