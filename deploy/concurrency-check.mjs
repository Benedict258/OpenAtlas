// GPU-lock check on the live backend: fires chat and transcription requests at the same moment, directly
// at the backend (so each response carries the server's own compute time, latency_seconds).
// Pass = every request succeeds, and total wall time ≈ the sum of compute times (they queued on the
// lock) rather than ≈ the longest one (they ran on the GPU together).
// Usage: node --env-file=.env deploy/concurrency-check.mjs   (NATLAS_BASE_URL / NATLAS_API_KEY from the notebook)
import { readFileSync } from "node:fs";

const base = process.env.NATLAS_BASE_URL.replace(/\/+$/, "").replace(/\/v1$/, "");
const auth = { Authorization: `Bearer ${process.env.NATLAS_API_KEY}` };
const chat = (q) => async () => {
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: q }], max_tokens: 150, temperature: 0.1, repetition_penalty: 1.12 }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const asr = (file, language) => async () => {
  const form = new FormData();
  form.append("audio", new Blob([readFileSync(`test-audio/eval/${file}`)]), "audio.wav");
  form.append("language", language);
  const r = await fetch(`${base}/v1/audio/transcriptions`, { method: "POST", headers: auth, body: form });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const jobs = [
  ["chat en", chat("In two sentences, what does INEC do?")],
  ["asr yo 90.6 s", asr("yo/yoruba-speech-transcribed-46.16k.wav", "yo")],
  ["chat ha", chat("Me ake nufi da kalmar 'gwagwarmaya'?")],
  ["asr ha 51 s", asr("51s.wav", "ha")],
  ["chat ig", chat("Kọwaa n'nkenke: gịnị bụ uru ịsa aka tupu iri nri?")],
  ["asr en-ng 7.5 s", asr("en-ng/nigerian_accented_english_dataset-0.16k.wav", "en-ng")],
];
const t0 = Date.now();
const out = await Promise.all(jobs.map(async ([name, run]) => {
  const s = Date.now();
  const r = await run().catch((e) => ({ status: 0, body: { error: e.message } }));
  return { name, ...r, wall: (Date.now() - s) / 1000 };
}));
const total = (Date.now() - t0) / 1000;
let compute = 0;
for (const o of out) {
  const c = o.body?.latency_seconds ?? 0;
  compute += c;
  const text = (o.body?.content ?? o.body?.text ?? JSON.stringify(o.body)).slice(0, 70);
  console.log(`${o.status === 200 ? "OK  " : "FAIL"} ${o.name.padEnd(16)} HTTP ${o.status}  wall ${o.wall.toFixed(1)}s  compute ${c}s  ${text}`);
}
const longest = Math.max(...out.map((o) => o.body?.latency_seconds ?? 0));
console.log(`\nall OK: ${out.every((o) => o.status === 200)} | total wall ${total.toFixed(1)}s | sum of compute ${compute.toFixed(1)}s | longest single compute ${longest}s`);
