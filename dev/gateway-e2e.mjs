// Local end-to-end check: real SDK → real gateway (wrangler dev, local D1) → MOCK RunPod.
// Verifies gateway logic (auth, license-cap accounting, cold-start polling, request shaping).
// It does NOT verify N-ATLaS — the upstream is dev/mock-runpod.
//
// Prereqs: `node dev/mock-runpod/server.mjs` and `npm run dev -w openatlas-gateway`
// with gateway/.dev.vars copied from .dev.vars.example (ACTIVE_USER_CAP=5).
// The cap test fills the local DB; before re-running, delete gateway/.wrangler/state and
// re-run `npm run db:init:local -w openatlas-gateway`.

import assert from "node:assert/strict";
import { OpenAtlas, OpenAtlasAPIError } from "../packages/sdk/dist/index.js";

const GW = process.env.GW ?? "http://127.0.0.1:8787";
const ADMIN = "local-admin-token-change-me";
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name, e.message]);
  }
};

const health = await fetch(`${GW}/v1/health`).then((r) => r.json());
assert.equal(health.upstream, "mock", "refusing to run: gateway is not pointed at the mock upstream");

const issued = await fetch(`${GW}/v1/admin/keys`, {
  method: "POST",
  headers: { Authorization: `Bearer ${ADMIN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ label: `e2e-${Date.now()}` }),
}).then((r) => r.json());
const client = new OpenAtlas({ apiKey: issued.key, baseURL: GW, maxRetries: 0 });

await check("admin endpoints reject a missing admin token", async () => {
  const r = await fetch(`${GW}/v1/admin/keys`, { method: "POST" });
  assert.equal(r.status, 401);
});

await check("invalid OpenAtlas key → 401 invalid_api_key", async () => {
  const bad = new OpenAtlas({ apiKey: "oa_nope", baseURL: GW, maxRetries: 0 });
  const err = await bad.chat({ messages: [{ role: "user", content: "x" }], user: "user-1" }).catch((e) => e);
  assert.ok(err instanceof OpenAtlasAPIError);
  assert.equal(err.code, "invalid_api_key");
});

await check("chat() survives a simulated cold start (queued → polled → completed)", async () => {
  const res = await client.chat({ messages: [{ role: "user", content: "Sannu" }], user: "user-1" });
  assert.match(res.content, /^\[MOCK/);
  assert.equal(res.model, "n-atlas-llm");
});

await check("chat() with language adds a system instruction", async () => {
  const res = await client.chat({ messages: [{ role: "user", content: "Bawo ni" }], language: "yo", user: "user-1" });
  assert.match(res.content, /System prompt: [1-9]\d* chars/);
});

await check("transcribe() routes audio to the ASR endpoint", async () => {
  const res = await client.transcribe({ audio: new Uint8Array(1234), language: "ig", user: "user-1" });
  assert.match(res.text, /1234 bytes of ig audio/);
  assert.equal(res.model, "n-atlas-asr-ig");
});

await check("gateway requires `user` (400 missing_user), even when the SDK is bypassed", async () => {
  const r = await fetch(`${GW}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${issued.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }),
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, "missing_user");
});

await check("gateway rejects an invalid language with 400", async () => {
  const r = await fetch(`${GW}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${issued.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audio: "AQID", language: "fr" }),
  });
  assert.equal(r.status, 400);
});

await check("license cap: new users refused at the cap, existing users still served", async () => {
  const { cap, active_users } = await fetch(`${GW}/v1/usage`, { headers: { Authorization: `Bearer ${ADMIN}` } }).then((r) => r.json());
  assert.ok(cap <= 50, `cap is ${cap}; set ACTIVE_USER_CAP=5 in .dev.vars for this test`);
  for (let i = active_users; i < cap; i++) {
    await client.chat({ messages: [{ role: "user", content: "x" }], user: `fill-${Date.now()}-${i}` });
  }
  const err = await client.chat({ messages: [{ role: "user", content: "x" }], user: `over-cap-${Date.now()}` }).catch((e) => e);
  assert.ok(err instanceof OpenAtlasAPIError, "expected a refusal");
  assert.equal(err.status, 429);
  assert.equal(err.code, "license_cap_reached");
  const again = await client.chat({ messages: [{ role: "user", content: "x" }], user: "user-1" });
  assert.match(again.content, /^\[MOCK/);
});

await check("usage endpoint reports active users and request log", async () => {
  const u = await fetch(`${GW}/v1/usage`, { headers: { Authorization: `Bearer ${ADMIN}` } }).then((r) => r.json());
  assert.equal(u.active_users, u.cap);
  assert.ok(u.requests_in_window > 0);
  console.log("usage:", JSON.stringify(u));
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`${results.length - failed}/${results.length} passed (upstream: MOCK — no N-ATLaS involved)`);
process.exit(failed ? 1 : 0);
