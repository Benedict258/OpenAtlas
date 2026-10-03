// Customer Service kit logic: voice note → transcribe() → normalizeText() → chat() (triage + draft).
// A wrong transcript goes back with its audio via reportIssue().
// Used by this kit's server.mjs and by the OpenAtlas website's live demo.
import { buildPrompt, normalizeText } from "@openatlas/sdk";

// ASR language code → chat language code (Nigerian-accented English replies in English).
const CHAT_LANGUAGE = { ha: "ha", yo: "yo", ig: "ig", "en-ng": "en" };
// Speech recognition is reliable on up to 30 s at a time (deploy/REPORT.md, KI-11), so longer notes
// arrive as several pieces of up to ~25 s, cut in the browser. Five pieces is about two minutes.
const MAX_PIECES = 5;
// reportIssue() accepts up to ~1 MB of base64 audio; longer clips are reported as text only.
const MAX_REPORT_AUDIO = 1_400_000;

// Structured prompt (the SDK's base layer + this task), with the format repeated after the customer's
// message. Measured against the previous free-form prompt in deploy/REPORT.md, section 18: the
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

