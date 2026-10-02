// Sends real requests to the deployed N-ATLaS LLM endpoint and records measured latency.
//
// 1. A queued job via /run + /status polling (survives a cold start of any length).
// 2. The same prompt via the OpenAI-compatible route, while the worker is warm.
//
// Results (actual input, actual output, wall-clock timings) are appended to
// deploy/llm/smoke-results.jsonl so the README's latency numbers come from real runs.
//
// Usage: node --env-file=.env deploy/llm/smoke-test.mjs

import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const { RUNPOD_API_KEY } = process.env;
const endpointId = process.env.LLM_ENDPOINT_ID ?? JSON.parse(readFileSync(join(here, "..", "endpoints.json"), "utf8")).llm.id;
const base = `https://api.runpod.ai/v2/${endpointId}`;
const headers = { Authorization: `Bearer ${RUNPOD_API_KEY}`, "Content-Type": "application/json" };

// Same prompt as the README quickstart (Features_UIUX.md §1.2).
const messages = [{ role: "user", content: "Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?" }];
// repetition_penalty 1.12 carried over from the Safroi notebook, which was tested against real N-ATLaS.
const sampling = { max_tokens: 300, temperature: 0.1, repetition_penalty: 1.12 };

const record = (entry) => {
  appendFileSync(join(here, "smoke-results.jsonl"), JSON.stringify({ at: new Date().toISOString(), endpointId, ...entry }) + "\n");
};

// --- 1. Queued job (cold-start tolerant) ---
const t0 = Date.now();
const run = await fetch(`${base}/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({ input: { messages, sampling_params: sampling } }),
}).then((r) => r.json());
console.log("Queued job", run.id, run.status);

let status;
while (true) {
  status = await fetch(`${base}/status/${run.id}`, { headers }).then((r) => r.json());
  if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status.status)) break;
  process.stdout.write(`  ${status.status} ${((Date.now() - t0) / 1000).toFixed(0)}s\r`);
  await new Promise((r) => setTimeout(r, 3000));
}
const queuedMs = Date.now() - t0;
console.log(`\nJob ${status.status} in ${(queuedMs / 1000).toFixed(1)}s (delayTime=${status.delayTime}ms, executionTime=${status.executionTime}ms)`);
console.log(JSON.stringify(status.output, null, 2));
record({ kind: "queued", status: status.status, wallMs: queuedMs, delayTime: status.delayTime, executionTime: status.executionTime, input: messages, output: status.output, error: status.error });
if (status.status !== "COMPLETED") process.exit(1);

// --- 2. OpenAI-compatible route (warm) ---
const t1 = Date.now();
const res = await fetch(`${base}/openai/v1/chat/completions`, {
  method: "POST",
  headers,
  body: JSON.stringify({ model: "n-atlas-llm", messages, ...sampling }),
});
const body = await res.json().catch(() => null);
const warmMs = Date.now() - t1;
console.log(`OpenAI route: HTTP ${res.status} in ${(warmMs / 1000).toFixed(1)}s`);
console.log(body?.choices?.[0]?.message?.content ?? JSON.stringify(body));
record({ kind: "openai-warm", httpStatus: res.status, wallMs: warmMs, input: messages, output: body });
