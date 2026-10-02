// Citizen Services kit logic: normalizeText() the question, then chat() over a small demo dataset.
// Used by this kit's server.mjs and by the OpenAtlas website's live demo.
import { normalizeText } from "openatlas";
import { DEMO_DATASET } from "./demo-dataset.mjs";

const LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const MAX_QUESTION = 2_000;

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

const SYSTEM_PROMPT = [
  "You are a helpful assistant answering questions from Nigerian citizens about public services.",
  "Answer ONLY from the reference notes below. If the notes do not cover the question, say so and suggest contacting the relevant agency.",
  "Keep answers short and practical.",
  "",
  "Reference notes (demo dataset):",
  ...DEMO_DATASET.map((d) => `- ${d.topic}: ${d.fact}`),
].join("\n");

export async function ask(client, { question, language, user } = {}) {
  if (typeof question !== "string" || !question.trim()) throw badRequest("Type a question first.");
  if (question.length > MAX_QUESTION) throw badRequest(`Questions are limited to ${MAX_QUESTION} characters.`);
  if (!LANGUAGES.has(language)) throw badRequest("Choose a language.");
  // Pasted or scraped text often has broken special characters (e.g. "Æ™" for "ƙ"); repair them first.
  const cleaned = normalizeText(question, { language });
  const response = await client.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: cleaned },
    ],
    language,
    user,
  });
  return { answer: response.content, model: response.model, normalized: cleaned !== question ? cleaned : null };
}
