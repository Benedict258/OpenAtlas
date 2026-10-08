// Points the live OpenAtlas gateway at an N-ATLaS backend (Colab, Kaggle or AMD, or any host running
// deploy/server/natlas_server.py). Config only: sets two Worker secrets; no code change or redeploy.
//
// Usage (repo root): node --env-file=.env deploy/set-backend.mjs <backend-url>
// The backend's key comes from NATLAS_API_KEY in .env (kept off the command line, where any process
// list would show it). Passing it as a second argument still works.
//
// 1. checks the backend directly (reachable, models loaded, key accepted)
// 2. stores BACKEND_URL and BACKEND_API_KEY as Cloudflare Worker secrets
// 3. waits until the gateway's /v1/health reports the new backend as reachable

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [url, keyArg] = process.argv.slice(2);
const key = keyArg ?? process.env.NATLAS_API_KEY;
const gateway = process.env.OPENATLAS_BASE_URL;
if (!url || !key) {
  console.error("Usage: node --env-file=.env deploy/set-backend.mjs <backend-url>   (key from NATLAS_API_KEY in .env)");
  process.exit(1);
}
if (!gateway) throw new Error("Set OPENATLAS_BASE_URL in .env (the gateway URL).");
// The gateway appends /v1/... itself, so a URL printed with a trailing /v1 is trimmed.
const backend = url.replace(/\/+$/, "").replace(/\/v1$/, "");
if (!backend.startsWith("https://")) throw new Error("The backend URL must be https:// (the Cloudflare Worker can't reach a local or plain-http host).");

console.log(`1/3 Checking ${backend} directly…`);
const health = await fetch(`${backend}/health`, { signal: AbortSignal.timeout(20_000) }).then((r) => r.json());
console.log("    health:", JSON.stringify(health));
if (health.mock) throw new Error("That backend is the MOCK server, refusing to point the live gateway at it.");
if (health.status !== "ok") console.warn(`    ! backend status is "${health.status}" (${health.error ?? health.stage}). Continuing; calls will 503 until it's ready.`);
// A 1-token chat proves the key is accepted (401 means the key is wrong).
const probe = await fetch(`${backend}/v1/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }], max_tokens: 1 }),
  signal: AbortSignal.timeout(120_000),
});
if (probe.status === 401) throw new Error("The backend rejected that key (401). Use the BACKEND_KEY printed by the notebook/server.");
console.log(`    key accepted (probe HTTP ${probe.status})`);

console.log("2/3 Storing Worker secrets…");
const gatewayDir = join(dirname(fileURLToPath(import.meta.url)), "..", "gateway");
for (const [name, value] of [["BACKEND_URL", backend], ["BACKEND_API_KEY", key]]) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], { cwd: gatewayDir, input: value, encoding: "utf8", shell: true });
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} failed:\n${r.stdout}\n${r.stderr}`);
  console.log(`    ${name} set`);
}

console.log("3/3 Waiting for the gateway to pick it up…");
const host = new URL(backend).host;
for (let i = 0; i < 30; i++) {
  const h = await fetch(`${gateway}/v1/health`).then((r) => r.json()).catch(() => null);
  if (h?.backend?.host === host && h.backend.reachable) {
    console.log("    gateway health:", JSON.stringify(h));
    console.log(`\nGateway ${gateway} now proxies to ${host}. Next: node --env-file=.env scripts/smoke-gateway.mjs`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
throw new Error("Gateway did not report the new backend as reachable within 90 s; check `curl $OPENATLAS_BASE_URL/v1/health`.");
