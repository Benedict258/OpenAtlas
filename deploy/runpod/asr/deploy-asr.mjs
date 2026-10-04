// Creates the RunPod Serverless endpoint for the four N-ATLaS ASR models (deploy/runpod/asr-worker).
// The image is built by .github/workflows/asr-image.yml and pushed to GHCR.
//
// Usage: node --env-file=.env deploy/runpod/asr/deploy-asr.mjs

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { RUNPOD_API_KEY, HF_TOKEN } = process.env;
if (!RUNPOD_API_KEY || !HF_TOKEN) {
  console.error("Set RUNPOD_API_KEY and HF_TOKEN.");
  process.exit(1);
}
const IMAGE = process.env.ASR_IMAGE ?? "ghcr.io/benedict258/openatlas-asr:latest";

const body = {
  name: "openatlas-natlas-asr",
  type: "QUEUE",
  image: IMAGE,
  env: { HF_TOKEN, PRELOAD_LANGUAGES: "ha,yo,ig,en-ng" },
  disk: 20,
  flashboot: "FLASHBOOT",
  // Pay-per-use only: scale to zero, one GPU max, stop billing 60 s after the last request.
  workers: { min: 0, max: 1, idleTimeout: 60 },
  // Four Whisper-small models (~0.5 GB each in fp16) fit easily in 16 GB; cheapest tier.
  gpu: { pools: ["AMPERE_16", "AMPERE_24"], count: 1 },
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
console.log("Created ASR endpoint:", endpoint.id);

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "endpoints.json");
const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
existing.asr = { id: endpoint.id, image: IMAGE, createdAt: new Date().toISOString() };
writeFileSync(outPath, JSON.stringify(existing, null, 2) + "\n");
console.log(`Saved to ${outPath}. Next: node --env-file=.env deploy/runpod/asr/smoke-test.mjs`);
