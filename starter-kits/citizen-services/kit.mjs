// Citizen Services kit logic: normalizeText() the question, then chat() over a small demo dataset.
// Used by this kit's server.mjs and by the OpenAtlas website's live demo.
import { buildPrompt, normalizeText } from "@openatlas/sdk";
import { DEMO_DATASET } from "./demo-dataset.mjs";

const LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const MAX_QUESTION = 2_000;

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Structured prompt (the SDK's base layer + this task). Measured against the previous free-form prompt in
// deploy/REPORT.md, section 18: out-of-scope questions were declined cleanly 5/6 instead of 1/6. The example
// decline is written in the reply language: with an English one, Hausa declines came back in English.
// The Hausa, Yoruba and Igbo example sentences have not yet been checked by a native speaker.
const NOTES = DEMO_DATASET.map((d) => `- ${d.topic}: ${d.fact}`).join("\n");
const DECLINE_EXAMPLE = {
  en: "I'm sorry, my notes don't have information about bus fares, so I can't answer that.",
  ha: "Yi haƙuri, bayanan da nake da su ba su ƙunshi bayani game da kuɗin mota ba, don haka ba zan iya amsa wannan ba.",
  yo: "Ẹ má bínú, àwọn àkọsílẹ̀ mi kò ní ìsọfúnni nípa owó ọkọ̀ èrò, nítorí náà mi ò lè dáhùn ìbéèrè yìí.",
  ig: "Ndo, ndetu m enweghị ozi gbasara ego ụgbọ ala, ya mere enweghị m ike ịza ajụjụ a.",
};
const promptSpec = (language) => ({
  language,
  role: "You answer citizens' questions about Nigerian public services.",
  task: [
    "Answer the citizen's question using ONLY the reference notes below.",
    "- If the notes cover the question: answer in 2–4 short sentences and name the agency from the notes.",
    "- If the notes do not cover the question (for example prices, fees, dates, travel, health, loans): say in one or two sentences that this information is not in your notes. Do not give general advice, prices, websites, apps or steps from outside the notes.",
  ].join("\n"),
  reference: NOTES,
  example: `Question: How much is a bus ticket from Abuja to Jos?\nReply: ${DECLINE_EXAMPLE[language]}`,
});

export async function ask(client, { question, language, user } = {}) {
  if (typeof question !== "string" || !question.trim()) throw badRequest("Type a question first.");
  if (question.length > MAX_QUESTION) throw badRequest(`Questions are limited to ${MAX_QUESTION} characters.`);
  if (!LANGUAGES.has(language)) throw badRequest("Choose a language.");
  // Pasted or scraped text often has broken special characters (e.g. "Æ™" for "ƙ"); repair them first.
  const cleaned = normalizeText(question, { language });
  const response = await client.chat({ messages: buildPrompt(promptSpec(language), cleaned), language, user });
  return { answer: response.content, model: response.model, normalized: cleaned !== question ? cleaned : null };
}
