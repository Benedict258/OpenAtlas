// Sends real voice notes to the deployed N-ATLaS ASR endpoint and records the transcripts and timings.
//
// Put recordings in test-audio/ named by language code: ha.*, yo.*, ig.*, en-ng.*
// (any format: .ogg/.opus from WhatsApp, .m4a, .mp3, .wav). Missing languages are skipped.
// Results go to deploy/runpod/asr/smoke-results.jsonl.
//
// Usage: node --env-file=.env deploy/runpod/asr/smoke-test.mjs

import { readFileSync, readdirSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const audioDir = join(here, "..", "..", "..", "test-audio");
const endpointId = process.env.ASR_ENDPOINT_ID ?? JSON.parse(readFileSync(join(here, "..", "endpoints.json"), "utf8")).asr.id;
const base = `https://api.runpod.ai/v2/${endpointId}`;
const headers = { Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`, "Content-Type": "application/json" };

const files = existsSync(audioDir) ? readdirSync(audioDir) : [];
const plan = ["ha", "yo", "ig", "en-ng"]
  .map((lang) => ({ lang, file: files.find((f) => f.split(".")[0] === lang) }))
  .filter((p) => p.file);
if (plan.length === 0) {
  console.error(`No recordings found in ${audioDir} (expected ha.*, yo.*, ig.*, en-ng.*).`);
  process.exit(1);
}

for (const { lang, file } of plan) {
  const audio = readFileSync(join(audioDir, file));
  const t0 = Date.now();
  const run = await fetch(`${base}/run`, { method: "POST", headers, body: JSON.stringify({ input: { audio_base64: audio.toString("base64"), language: lang } }) });
  if (!run.ok) throw new Error(`/run HTTP ${run.status}: ${await run.text()}`);
  const { id } = await run.json();
  let status;
  while (true) {
    status = await fetch(`${base}/status/${id}`, { headers }).then((r) => r.json());
    if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status.status)) break;
    process.stdout.write(`  [${lang}] ${status.status} ${((Date.now() - t0) / 1000).toFixed(0)}s   \r`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const wallMs = Date.now() - t0;
  appendFileSync(join(here, "smoke-results.jsonl"), JSON.stringify({
    at: new Date().toISOString(), endpointId, lang, file, bytes: audio.length, status: status.status, wallMs,
    delayTime: status.delayTime, executionTime: status.executionTime, output: status.output, error: status.error,
  }) + "\n");
  console.log(`\n=== ${lang} (${file}, ${(audio.length / 1024).toFixed(0)} KB): ${status.status} | wall ${(wallMs / 1000).toFixed(1)}s | delay ${status.delayTime}ms | execution ${status.executionTime}ms`);
  console.log(`TRANSCRIPT: ${status.output?.text ?? JSON.stringify(status.output ?? status.error)}`);
}
