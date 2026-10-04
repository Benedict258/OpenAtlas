// Creates the RunPod Serverless endpoint that serves the N-ATLaS LLM.
//
// Uses RunPod's official vLLM worker image, so no custom container build is needed.
// N-ATLaS is a Llama-3 8B fine-tune: fp16 weights are ~16 GB, which fits a 24 GB GPU
// with an 8k context, so no quantization is applied by default. Set QUANTIZATION=bitsandbytes
// to force 4-bit (same scheme the Safroi Colab notebook used on a T4).
//
// Usage:
//   node --env-file=.env deploy/runpod/llm/deploy-llm.mjs

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { RUNPOD_API_KEY, HF_TOKEN } = process.env;
if (!RUNPOD_API_KEY || !HF_TOKEN) {
  console.error("Set RUNPOD_API_KEY and HF_TOKEN (HF account must have accepted NCAIR1/N-ATLaS terms).");
  process.exit(1);
}

// Pinned: v2.27.1 was a rollback release and v2.28.0 is days old as of 2026-10-02.
const IMAGE = process.env.VLLM_IMAGE ?? "runpod/worker-v1-vllm:v2.27.2";

const env = {
  MODEL_NAME: "NCAIR1/N-ATLaS",
  HF_TOKEN,
  MAX_MODEL_LEN: "8192",
  GPU_MEMORY_UTILIZATION: "0.92",
  OPENAI_SERVED_MODEL_NAME_OVERRIDE: "n-atlas-llm",
};
if (process.env.QUANTIZATION) env.QUANTIZATION = process.env.QUANTIZATION;

const body = {
  name: "openatlas-natlas-llm",
  type: "QUEUE",
  image: IMAGE,
  env,
  disk: 40,
  flashboot: "FLASHBOOT",
  // Pay-per-use only (owner's decision): scale to zero, never more than one GPU at a time,
  // and stop billing 60 s after the last request. Trade-off: the next request after that is a cold start.
  workers: { min: 0, max: 1, idleTimeout: 60 },
  // AMPERE_24 (L4 / 3090 / A5000, $0.69/hr serverless) first; ADA_24 (4090, $1.10/hr) as fallback.
  gpu: { pools: ["AMPERE_24", "ADA_24"], count: 1 },
  scaling: { type: "QUEUE_DELAY", queueDelay: 4 },
  timeout: 600000,
};

const res = await fetch("https://api.runpod.io/v2/serverless", {
  method: "POST",
  headers: { Authorization: `Bearer ${RUNPOD_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`RunPod returned ${res.status}:\n${text}`);
  process.exit(1);
}
const endpoint = JSON.parse(text);
console.log("Created endpoint:", endpoint.id);
console.log(JSON.stringify(endpoint.requestUrls ?? {}, null, 2));

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "endpoints.json");
const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
existing.llm = { id: endpoint.id, image: IMAGE, createdAt: new Date().toISOString() };
writeFileSync(outPath, JSON.stringify(existing, null, 2) + "\n");
console.log(`Saved to ${outPath}. Next: node deploy/runpod/llm/smoke-test.mjs`);
