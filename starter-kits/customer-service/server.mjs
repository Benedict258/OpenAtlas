// Customer Service starter kit: voice note → transcribe() → normalizeText() → chat() (triage + draft reply).
// A wrong transcript can be corrected and sent back with its audio via reportIssue().
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { OpenAtlas, OpenAtlasError, normalizeText } from "openatlas";

const client = new OpenAtlas();
const page = readFileSync(new URL("./index.html", import.meta.url));
// ASR language code → chat language code (Nigerian-accented English replies in English).
const CHAT_LANGUAGE = { ha: "ha", yo: "yo", ig: "ig", "en-ng": "en" };

const TRIAGE_PROMPT = [
  "You are a customer-support assistant for a small Nigerian business.",
  "Read the customer's message and reply in exactly this format:",
  "Category: <billing | delivery | product issue | account | other>",
  "Urgency: <low | medium | high>",
  "Draft reply: <a short, polite reply to the customer>",
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
      return send(res, 200, { mock: health.backend?.mock === true });
    }
    if (req.method === "POST" && req.url === "/api/ticket") {
      const { audio, language, user } = await readJson(req);
      if (!audio || !CHAT_LANGUAGE[language]) return send(res, 400, { error: "audio and a valid language are required" });

      // Step 1: speech → text with the matching N-ATLaS ASR model.
      const transcript = await client.transcribe({ audio, language, user });
      const text = normalizeText(transcript.text, { language });
      // Step 2: triage + draft with the N-ATLaS LLM.
      const draft = await client.chat({
        messages: [
          { role: "system", content: TRIAGE_PROMPT },
          { role: "user", content: text },
        ],
        language: CHAT_LANGUAGE[language],
        user,
      });
      return send(res, 200, {
        transcript: text,
        asrModel: transcript.model,
        draft: draft.content,
        llmModel: draft.model,
      });
    }
    if (req.method === "POST" && req.url === "/api/report") {
      const { audio, transcript, correction, language, user } = await readJson(req);
      if (!transcript || !correction || !CHAT_LANGUAGE[language]) return send(res, 400, { error: "transcript, correction and language are required" });
      // Audio paired with a human-corrected transcript is the most useful contribution, but reports
      // are capped at ~1 MB of base64 audio; longer clips are reported as text only.
      const clip = audio && audio.length <= 1_400_000 ? audio : undefined;
      const report = await client.reportIssue({ kind: "transcription", output: transcript, correction, language, audio: clip, user });
      return send(res, 200, { ...report, audio_included: Boolean(clip) });
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 502, { error: err instanceof OpenAtlasError ? err.message : String(err) });
  }
}).listen(Number(process.env.PORT ?? 3003), () => console.log(`Customer Service demo on http://localhost:${process.env.PORT ?? 3003}`));
