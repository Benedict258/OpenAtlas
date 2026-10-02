// Customer Service kit logic: voice note → transcribe() → normalizeText() → chat() (triage + draft).
// A wrong transcript goes back with its audio via reportIssue().
// Used by this kit's server.mjs and by the OpenAtlas website's live demo.
import { normalizeText } from "openatlas";

// ASR language code → chat language code (Nigerian-accented English replies in English).
const CHAT_LANGUAGE = { ha: "ha", yo: "yo", ig: "ig", "en-ng": "en" };
// reportIssue() accepts up to ~1 MB of base64 audio; longer clips are reported as text only.
const MAX_REPORT_AUDIO = 1_400_000;

const TRIAGE_PROMPT = [
  "You are a customer-support assistant for a small Nigerian business.",
  "Read the customer's message and reply in exactly this format:",
  "Category: <billing | delivery | product issue | account | other>",
  "Urgency: <low | medium | high>",
  "Draft reply: <a short, polite reply to the customer>",
].join("\n");

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export async function ticket(client, { audio, language, user } = {}) {
  if (typeof audio !== "string" || !audio) throw badRequest("Record or upload a voice note first.");
  if (!CHAT_LANGUAGE[language]) throw badRequest("Choose a language.");
  // Step 1: speech → text with the matching N-ATLaS ASR model, then repair any broken characters.
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
  return { transcript: text, asrModel: transcript.model, draft: draft.content, llmModel: draft.model };
}

export async function report(client, { audio, transcript, correction, language, user } = {}) {
  if (typeof transcript !== "string" || !transcript) throw badRequest("There is no transcript to correct.");
  if (typeof correction !== "string" || !correction.trim()) throw badRequest("Type the corrected transcript.");
  if (!CHAT_LANGUAGE[language]) throw badRequest("Choose a language.");
  const clip = typeof audio === "string" && audio.length <= MAX_REPORT_AUDIO ? audio : undefined;
  const result = await client.reportIssue({ kind: "transcription", output: transcript, correction, language, audio: clip, user });
  return { ...result, audio_included: Boolean(clip) };
}
