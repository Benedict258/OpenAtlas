// Customer Service kit logic, two ways in:
//   voice note → transcribe() → normalizeText() → chat() (triage + draft); a wrong transcript goes back
//   with its audio via reportIssue().
//   text chat  → a back-and-forth conversation with chat(), for customers who'd rather type.
// Used by this kit's server.mjs and by the OpenAtlas website's live demo.
import { buildPrompt, normalizeText, systemPrompt } from "@openatlas/sdk";

// ASR language code → chat language code (Nigerian-accented English replies in English).
const CHAT_LANGUAGE = { ha: "ha", yo: "yo", ig: "ig", "en-ng": "en" };
// Speech recognition is reliable on up to 30 s at a time (docs/REPORT.md, KI-11), so longer notes
// arrive as several pieces of up to ~25 s, cut in the browser. Five pieces is about two minutes.
const MAX_PIECES = 5;
// reportIssue() accepts up to ~1 MB of base64 audio; longer clips are reported as text only.
const MAX_REPORT_AUDIO = 1_400_000;

// Structured prompt (the SDK's base layer + this task), with the format repeated after the customer's
// message. Measured against the previous free-form prompt in docs/REPORT.md, section 18: the
// three-line format with English labels was followed 10/10 instead of 3/10.
const triageSpec = (language) => ({
  language,
  role: "You help a small Nigerian business triage customer voice notes.",
  task: [
    "The user's message is a transcript of a customer's voice note. It may contain speech-recognition errors.",
    "Classify it, then draft a reply that answers the customer: acknowledge their problem and say what the business will do next. Do not repeat the customer's message back to them.",
  ].join("\n"),
  format: [
    "Exactly three lines. The labels and the category and urgency values stay in English; only the draft reply is in the customer's language.",
    "Category: one of billing, delivery, product issue, account, other",
    "Urgency: one of low, medium, high",
    "Draft reply: <the reply to the customer>",
  ].join("\n"),
  example: [
    'Customer: "I paid for my order last week and it still hasn\'t arrived."',
    "Category: delivery",
    "Urgency: medium",
    "Draft reply: We're sorry your order hasn't arrived yet. We are checking with the courier now and will update you within 24 hours.",
  ].join("\n"),
  inputLabel: "Customer message:",
  reminder: "Reply in the three-line format: labels and values in English, the draft reply in {language}.",
});

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export async function ticket(client, { audio, pieces, language, user } = {}) {
  // `pieces`: the note cut into ≤25 s parts (what the kit's page sends); `audio`: one clip of ≤30 s.
  const parts = Array.isArray(pieces) ? pieces : typeof audio === "string" && audio ? [audio] : [];
  if (parts.length === 0 || !parts.every((p) => typeof p === "string" && p)) throw badRequest("Record or upload a voice note first.");
  if (parts.length > MAX_PIECES) throw badRequest("Voice notes are limited to about two minutes.");
  if (!CHAT_LANGUAGE[language]) throw badRequest("Choose a language.");
  // Step 1: speech → text with the matching N-ATLaS ASR model, one piece at a time, then repair any
  // broken characters.
  const texts = [];
  let asrModel = "";
  for (const part of parts) {
    const t = await client.transcribe({ audio: part, language, user });
    texts.push(t.text.trim());
    asrModel = t.model;
  }
  const text = normalizeText(texts.filter(Boolean).join(" "), { language });
  // Step 2: triage + draft with the N-ATLaS LLM. No `language` here: the prompt states it, and the
  // gateway's trailing "Respond in <language>." made the model translate the format labels.
  const draft = await client.chat({ messages: buildPrompt(triageSpec(CHAT_LANGUAGE[language]), text), user });
  return { transcript: text, pieces: parts.length, asrModel, draft: draft.content, llmModel: draft.model, attribution: draft.attribution };
}

export async function report(client, { audio, transcript, correction, language, user } = {}) {
  if (typeof transcript !== "string" || !transcript) throw badRequest("There is no transcript to correct.");
  if (typeof correction !== "string" || !correction.trim()) throw badRequest("Type the corrected transcript.");
  if (!CHAT_LANGUAGE[language]) throw badRequest("Choose a language.");
  const clip = typeof audio === "string" && audio.length <= MAX_REPORT_AUDIO ? audio : undefined;
  const result = await client.reportIssue({ kind: "transcription", output: transcript, correction, language, audio: clip, user });
  return { ...result, audio_included: Boolean(clip) };
}

// Text chat. The business below is made up for the demo (the window labels it "Sample only"); a real
// deployment replaces DEMO_BUSINESS with its own policies. The browser keeps the conversation and sends
// it with each message, so nothing is stored server-side.
const DEMO_BUSINESS = [
  "Business: Ada & Sons Home Goods, a small online shop in Lagos (fictional, for this demo).",
  "Sells: kitchenware, small appliances, bedding.",
  "Delivery: within Lagos in 1-3 working days; other states in 3-7 working days. Customers get a tracking number by SMS when the order ships.",
  "Returns: damaged or wrong items can be returned within 7 days of delivery, with a photo of the item. Refunds go back to the original payment method within 5 working days of approval.",
  "Payment: card or bank transfer. A failed transfer that debited the customer is usually reversed by their bank within 24 hours.",
  "Opening hours: Monday to Saturday, 8am to 6pm.",
  "Contact: customers reach the shop through this chat. To start a return or report damage, they send the order number and a photo here, and a staff member replies. There is no email address or phone number to give out.",
  "Order details, refunds and exceptions can only be confirmed by a staff member; you cannot look up orders.",
].join("\n");

const supportChatSpec = (language) => ({
  language,
  role: "You are the customer support assistant for the small business described in the Reference notes, chatting with one of its customers.",
  task: [
    "Answer the customer's latest message, taking the earlier conversation into account.",
    "Use only the Reference notes for policies, times and prices. If something isn't covered, say a staff member will confirm it.",
    "You cannot see any orders. If the customer asks about a specific order, ask for the order number; once you have it, say a staff member will check that order and get back to them. Never say an order has been checked, found, shipped or delayed.",
    "Reply in 1-4 short sentences, in a polite, practical tone.",
  ].join("\n"),
  reference: DEMO_BUSINESS,
});

const CHAT_REMINDER = "(Reply to the customer in 1-4 sentences. State delivery times, return rules, payment and opening hours exactly as the Reference notes give them, and never make up contact details. You cannot see orders: never say an order has been checked, found, shipped or delayed; say a staff member will check it.)";

// Limits on what the browser can send: enough for a real support exchange, not a free LLM.
const MAX_CHAT_TURNS = 12;
const MAX_CHAT_MESSAGE = 1_000;

export async function converse(client, { messages, language, user } = {}) {
  const chatLanguage = CHAT_LANGUAGE[language];
  if (!chatLanguage) throw badRequest("Choose a language.");
  if (!Array.isArray(messages) || messages.length === 0) throw badRequest("Type a message first.");
  const valid = messages.every((m) => ["user", "assistant"].includes(m?.role) && typeof m.content === "string" && m.content.trim() && m.content.length <= MAX_CHAT_MESSAGE);
  if (!valid) throw badRequest(`Each message must be text of up to ${MAX_CHAT_MESSAGE} characters.`);
  if (messages.at(-1).role !== "user") throw badRequest("The last message must be the customer's.");
  // Older turns drop off; the conversation must still start with the customer.
  let recent = messages.slice(-MAX_CHAT_TURNS);
  while (recent[0].role !== "user") recent = recent.slice(1);
  const history = recent.map((m) => ({ role: m.role, content: m.role === "user" ? normalizeText(m.content.trim(), { language }) : m.content.trim() }));
  // The rule the model broke most in testing, repeated after the latest message (as buildPrompt's
  // `reminder` does; docs/REPORT.md, section 18).
  history[history.length - 1].content = `Customer message:\n${history.at(-1).content}\n\n${CHAT_REMINDER}`;
  const reply = await client.chat({ messages: [{ role: "system", content: systemPrompt(supportChatSpec(chatLanguage)) }, ...history], language: chatLanguage, user });
  return { reply: reply.content, model: reply.model, attribution: reply.attribution, turns: history.length, truncated: recent.length < messages.length };
}

// Optional last step: read N-ATLaS's drafted reply aloud with speak(), a separate text-to-speech renderer.
// Only the "Draft reply:" part is spoken (never the labels or the customer's own words), and the text is
// passed through unchanged.
const SPEECH_LANGUAGE = { ha: "ha", yo: "yo", ig: "ig", "en-ng": "en" };
export function draftReply(draft) {
  const m = /^\s*\**draft reply\**\s*:\s*\**\s*([\s\S]+)$/im.exec(typeof draft === "string" ? draft : "");
  return m ? m[1].replaceAll("*", "").trim() || null : null;
}

// Works in Node and in Workers/browsers (no Buffer).
function base64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function speakDraft(client, { draft, language, user } = {}) {
  if (!SPEECH_LANGUAGE[language]) throw badRequest("Choose a language.");
  const text = draftReply(draft);
  if (!text) throw badRequest("There is no drafted reply to read aloud.");
  const r = await client.speak({ text, language: SPEECH_LANGUAGE[language], user });
  return {
    audio: base64(r.audio),
    seconds: r.seconds,
    engine: r.engine,
    model: r.model,
    attribution: r.attribution,
    warnings: r.warnings,
    fallback_reason: r.fallback_reason ?? null,
    spoken: text,
  };
}
