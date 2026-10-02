// Unit tests for SDK behaviour only (request shape, errors, retries), using a stub fetch.
// These do NOT exercise N-ATLaS; end-to-end checks live in deploy/ and the starter kits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAtlas, OpenAtlasAPIError, OpenAtlasError, OpenAtlasTimeoutError } from "../dist/index.js";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stub(...responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(init) : next;
  };
  return { fetch, calls };
}

const make = (fetch, extra = {}) => new OpenAtlas({ apiKey: "oa_test", baseURL: "https://gw.example/", fetch, ...extra });

test("chat posts to the gateway with the OpenAtlas key", async () => {
  const s = stub(json(200, { content: "hi", model: "n-atlas-llm" }));
  const res = await make(s.fetch).chat({ messages: [{ role: "user", content: "Sannu" }], language: "ha", user: "u1" });
  assert.equal(res.content, "hi");
  assert.equal(s.calls[0].url, "https://gw.example/v1/chat/completions");
  assert.equal(s.calls[0].init.headers.Authorization, "Bearer oa_test");
  assert.deepEqual(s.calls[0].body, { messages: [{ role: "user", content: "Sannu" }], language: "ha", user: "u1" });
});

test("transcribe base64-encodes bytes and strips data: prefixes", async () => {
  const s = stub(json(200, { text: "t", language: "yo", model: "n-atlas-asr-yo" }), json(200, { text: "t", language: "yo", model: "m" }));
  const client = make(s.fetch);
  await client.transcribe({ audio: new Uint8Array([1, 2, 3]), language: "yo", user: "u" });
  await client.transcribe({ audio: "data:audio/webm;base64,AQID", language: "yo", user: "u" });
  assert.equal(s.calls[0].body.audio, "AQID");
  assert.equal(s.calls[1].body.audio, "AQID");
});

test("rejects unsupported languages before any request", async () => {
  const s = stub();
  await assert.rejects(make(s.fetch).transcribe({ audio: "AQID", language: "fr" }), OpenAtlasError);
  await assert.rejects(make(s.fetch).chat({ messages: [{ role: "user", content: "x" }], language: "en-ng" }), OpenAtlasError);
  assert.equal(s.calls.length, 0);
});

test("4xx surfaces a typed error with the gateway's code and is not retried", async () => {
  const s = stub(json(429, { error: { code: "license_cap_reached", message: "cap" } }));
  const err = await make(s.fetch).chat({ messages: [{ role: "user", content: "x" }], user: "u" }).catch((e) => e);
  assert.ok(err instanceof OpenAtlasAPIError);
  assert.equal(err.status, 429);
  assert.equal(err.code, "license_cap_reached");
  assert.equal(s.calls.length, 1);
});

test("503 is retried, then succeeds", async () => {
  const s = stub(json(503, { error: { code: "upstream_unavailable", message: "x" } }), json(200, { content: "ok", model: "n-atlas-llm" }));
  const res = await make(s.fetch, { maxRetries: 1 }).chat({ messages: [{ role: "user", content: "x" }], user: "u" });
  assert.equal(res.content, "ok");
  assert.equal(s.calls.length, 2);
});

test("timeout raises OpenAtlasTimeoutError mentioning cold starts", async () => {
  const hang = (init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const s = stub(hang);
  const err = await make(s.fetch, { timeoutMs: 50 }).chat({ messages: [{ role: "user", content: "x" }], user: "u" }).catch((e) => e);
  assert.ok(err instanceof OpenAtlasTimeoutError);
  assert.match(err.message, /cold start/);
});

test("chat() and transcribe() require a user id, before any request", async () => {
  const s = stub();
  await assert.rejects(make(s.fetch).chat({ messages: [{ role: "user", content: "x" }] }), /user` is required/);
  await assert.rejects(make(s.fetch).transcribe({ audio: "AQID", language: "ha", user: " " }), /user` is required/);
  assert.equal(s.calls.length, 0);
});

test("constructor requires a key and a base URL", () => {
  delete process.env.OPENATLAS_API_KEY;
  delete process.env.OPENATLAS_BASE_URL;
  assert.throws(() => new OpenAtlas({ baseURL: "https://x" }), /API key/);
  assert.throws(() => new OpenAtlas({ apiKey: "k" }), /gateway URL/);
});
