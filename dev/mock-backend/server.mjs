// MOCK N-ATLaS backend — for local development of the gateway and starter kits ONLY.
//
// Speaks both backend protocols the gateway supports, but runs NO model:
//   - the http backend contract (GET /health, POST /v1/chat/completions,
//     POST /v1/audio/transcriptions), like deploy/server/natlas_server.py
//   - RunPod's queue API (/v2/{id}/runsync, /v2/{id}/status/{job}), like the RunPod workers
// Every output is prefixed with "[MOCK — not N-ATLaS output]" so it can never be mistaken
// for a real response, and the gateway's /v1/health reports `backend.mock: true`.
//
// The first job per endpoint simulates a cold start (IN_QUEUE → IN_PROGRESS → COMPLETED)
// so the gateway's polling path is exercised too. The timing is arbitrary, not a measurement.
//
// Usage: node dev/mock-backend/server.mjs   (listens on :8788, expects key "mock-backend-key")

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8788);
const KEY = "mock-backend-key";
const PREFIX = "[MOCK — not N-ATLaS output]";
const jobs = new Map();
const warmed = new Set();

function produceOutput(endpointId, input) {
  if (input?.openai_input) {
    const msgs = input.openai_input.messages ?? [];
    const last = msgs.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const system = msgs.find((m) => m.role === "system")?.content ?? "";
    const content = `${PREFIX} Received ${msgs.length} message(s). System prompt: ${system.length} chars. Last user message: "${last.slice(0, 120)}"`;
    // Generator handler → list of yielded values, like worker-vllm.
    return [{ id: "mock", object: "chat.completion", model: "n-atlas-llm", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }];
  }
  if (input?.audio_base64 !== undefined) {
    const bytes = Buffer.from(input.audio_base64, "base64").length;
    return { text: `${PREFIX} Transcript placeholder for ${bytes} bytes of ${input.language} audio.`, language: input.language, model: `n-atlas-asr-${input.language}` };
  }
  return { error: "mock: unrecognised job input" };
}

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { status: "ok", stage: "ready", llm: true, asr: ["en-ng", "ha", "ig", "yo"], mock: true });
  }
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(res, 401, { detail: "mock: bad key" });

  // http backend contract
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    return send(res, 200, produceOutput("http", { openai_input: await readJson(req) })[0]);
  }
  if (req.method === "POST" && req.url === "/v1/audio/transcriptions") {
    const out = produceOutput("http", await readJson(req));
    return send(res, 200, { ...out, inference_ms: 0 });
  }

  // RunPod queue API
  const m = /^\/v2\/([^/]+)\/(runsync|run|status)(?:\/([^/]+))?$/.exec(req.url);
  if (!m) return send(res, 404, { error: "mock: no route" });
  const [, endpointId, action, jobId] = m;

  if (action === "status") {
    const job = jobs.get(jobId);
    if (!job) return send(res, 404, { error: "mock: unknown job" });
    job.polls++;
    if (job.polls === 1) return send(res, 200, { id: jobId, status: "IN_PROGRESS" });
    return send(res, 200, { id: jobId, status: "COMPLETED", output: job.output, delayTime: 0, executionTime: 0 });
  }

  const { input } = await readJson(req);
  const id = randomUUID();
  const output = produceOutput(endpointId, input);

  if (!warmed.has(endpointId)) {
    warmed.add(endpointId);
    jobs.set(id, { output, polls: 0 });
    return send(res, 200, { id, status: "IN_QUEUE" });
  }
  send(res, 200, { id, status: "COMPLETED", output, delayTime: 0, executionTime: 0 });
}).listen(PORT, () => console.log(`MOCK N-ATLaS backend listening on http://127.0.0.1:${PORT} — NOT a real model`));
