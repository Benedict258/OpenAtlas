// Education starter kit: tutoring-style explanations at a chosen level, via chat();
// wrong answers are flagged back to OpenAtlas with reportIssue().
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { OpenAtlas, OpenAtlasError } from "openatlas";

const client = new OpenAtlas();
const page = readFileSync(new URL("./index.html", import.meta.url));
const LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const LEVELS = {
  primary: "a primary-school pupil (about 8–11 years old). Use very simple words, short sentences and one everyday example.",
  secondary: "a secondary-school student (about 12–17 years old). Explain the key idea clearly, define any technical terms, and give one worked example.",
};

async function readJson(req) {
  // Concatenate bytes before decoding so multi-byte characters split across chunks survive.
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page);
    }
    if (req.method === "GET" && req.url === "/api/status") {
      const health = await fetch(`${client.baseURL}/v1/health`).then((r) => r.json());
      return send(res, 200, { mock: health.backend?.mock === true });
    }
    if (req.method === "POST" && req.url === "/api/explain") {
      const { question, language, level, user } = await readJson(req);
      if (!question || !LANGUAGES.has(language) || !LEVELS[level]) return send(res, 400, { error: "question, language and level are required" });
      // Same chat() call as every other kit; only the instructional framing changes.
      const response = await client.chat({
        messages: [
          { role: "system", content: `You are a patient tutor. Explain the student's question for ${LEVELS[level]}` },
          { role: "user", content: question },
        ],
        language,
        user,
      });
      return send(res, 200, { explanation: response.content, model: response.model });
    }
    if (req.method === "POST" && req.url === "/api/report") {
      const { question, explanation, correction, language, user } = await readJson(req);
      if (!question || !explanation || !correction) return send(res, 400, { error: "question, explanation and correction are required" });
      const report = await client.reportIssue({ kind: "chat", input: question, output: explanation, correction, language, user });
      return send(res, 200, report);
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 502, { error: err instanceof OpenAtlasError ? err.message : String(err) });
  }
}).listen(Number(process.env.PORT ?? 3002), () => console.log(`Education demo on http://localhost:${process.env.PORT ?? 3002}`));
