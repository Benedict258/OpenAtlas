// Sends real requests to the deployed N-ATLaS LLM endpoint and records measured latency.
//
// Uses the exact job shape the gateway sends ({openai_route, openai_input}), so a pass here
// also confirms the gateway's upstream contract.
//
// 1. Yoruba prompt (README quickstart) as a queued job via /run + /status polling — measures cold start.
// 2. Same Yoruba prompt again, now warm.
// 3. Hausa version of the same question, warm — for the quickstart-language comparison.
//
// Every request's actual input, actual output and wall-clock timings are appended to
// deploy/llm/smoke-results.jsonl, so the README's numbers come from real runs.
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
const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

const PROMPTS = {
  yo: "Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?",
  ha: "Za ka iya bayyana dalilin da ya sa sararin sama yake shuɗi?",
};

const jobInput = (content) => ({
  openai_route: "/v1/chat/completions",
  openai_input: {
    model: "n-atlas-llm",
    messages: [{ role: "user", content }],
    max_tokens: 300,
    temperature: 0.1,
    repetition_penalty: 1.12,
    chat_template_kwargs: { date_string: today },
  },
});

async function runJob(label, content) {
  const t0 = Date.now();
  const run = await fetch(`${base}/run`, { method: "POST", headers, body: JSON.stringify({ input: jobInput(content) }) });
  if (!run.ok) throw new Error(`/run HTTP ${run.status}: ${await run.text()}`);
  const { id } = await run.json();
  let status;
  while (true) {
    status = await fetch(`${base}/status/${id}`, { headers }).then((r) => r.json());
    if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status.status)) break;
    process.stdout.write(`  [${label}] ${status.status} ${((Date.now() - t0) / 1000).toFixed(0)}s   \r`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const wallMs = Date.now() - t0;
  const output = Array.isArray(status.output) ? status.output[0] : status.output;
  const text = output?.choices?.[0]?.message?.content;
  const entry = {
    at: new Date().toISOString(), endpointId, label, status: status.status, wallMs,
    delayTime: status.delayTime, executionTime: status.executionTime,
    input: content, output: text ?? output, usage: output?.usage, error: status.error ?? output?.error,
  };
  appendFileSync(join(here, "smoke-results.jsonl"), JSON.stringify(entry) + "\n");
  console.log(`\n=== ${label}: ${status.status} | wall ${(wallMs / 1000).toFixed(1)}s | queue/cold delay ${status.delayTime}ms | execution ${status.executionTime}ms`);
  console.log(`INPUT : ${content}`);
  console.log(`OUTPUT: ${text ?? JSON.stringify(output ?? status.error)}`);
  if (status.status !== "COMPLETED" || typeof text !== "string") process.exitCode = 1;
  return entry;
}

console.log(`Endpoint ${endpointId}, date_string "${today}"`);
await runJob("yo-cold", PROMPTS.yo);
if (process.exitCode) process.exit(1);
await runJob("yo-warm", PROMPTS.yo);
await runJob("ha-warm", PROMPTS.ha);
