// Citizen Services starter kit: local-language Q&A over a small demo dataset, via normalizeText() + chat().
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { OpenAtlas, OpenAtlasError, normalizeText } from "openatlas";
import { DEMO_DATASET } from "./demo-dataset.mjs";

const client = new OpenAtlas();
const page = readFileSync(new URL("./index.html", import.meta.url));
const LANGUAGE_NAMES = { en: "English", ha: "Hausa", yo: "Yoruba", ig: "Igbo" };

const systemPrompt = () =>
  [
    "You are a helpful assistant answering questions from Nigerian citizens about public services.",
    "Answer ONLY from the reference notes below. If the notes do not cover the question, say so and suggest contacting the relevant agency.",
    "Keep answers short and practical.",
    "",
    "Reference notes (demo dataset):",
    ...DEMO_DATASET.map((d) => `- ${d.topic}: ${d.fact}`),
  ].join("\n");

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
      return send(res, 200, { mock: health.backend?.mock === true, dataset: DEMO_DATASET.map((d) => d.topic) });
    }
    if (req.method === "POST" && req.url === "/api/ask") {
      const { question, language, user } = await readJson(req);
      if (!question || !LANGUAGE_NAMES[language]) return send(res, 400, { error: "question and a valid language are required" });
      // Pasted or scraped text often has broken special characters (e.g. "Æ™" for "ƙ"); repair them first.
      const cleaned = normalizeText(question, { language });
      const response = await client.chat({
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: cleaned },
        ],
        language,
        user,
      });
      return send(res, 200, { answer: response.content, model: response.model, normalized: cleaned !== question ? cleaned : null });
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 502, { error: err instanceof OpenAtlasError ? err.message : String(err) });
  }
}).listen(Number(process.env.PORT ?? 3001), () => console.log(`Citizen Services demo on http://localhost:${process.env.PORT ?? 3001}`));
