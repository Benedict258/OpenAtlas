// The website playground (/playground): chat(), transcribe() and speak() straight from the browser, with
// no SDK or key of the visitor's own. Requests go through the site's shared demo key (a Worker secret),
// so these caps sit in front of it, on top of the per-IP limit (site/wrangler.toml), the key's daily
// quota and its share of the license cap (gateway). Each handler returns the SDK's response unchanged,
// plus the time the call took, so visitors see exactly what their own code would get.

const CHAT_LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const ASR_LANGUAGES = new Set(["en-ng", "ha", "yo", "ig"]);
const SPEECH_LANGUAGES = new Set(["en", "ha", "yo", "ig", "pcm"]);
const SPEECH_ENGINES = new Set(["auto", "sorotts", "mms"]);

const MAX_TURNS = 10;
const MAX_MESSAGE = 2_000;
const MAX_TOKENS = 512;
// 30 s of 16 kHz mono 16-bit WAV is ~960 KB, ~1.28 MB as base64. The page converts every clip to that.
const MAX_AUDIO_BASE64 = 1_400_000;
const MAX_SPEECH_TEXT = 300;

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const timed = async (call) => {
  const started = Date.now();
  const result = await call();
  return { result, ms: Date.now() - started };
};

export async function playChat(client, { messages, system, language, max_tokens, temperature, user } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) throw badRequest("Type a message first.");
  if (messages.length > MAX_TURNS) throw badRequest(`The playground keeps up to ${MAX_TURNS} messages. Start a new conversation.`);
  const ok = messages.every((m) => ["user", "assistant"].includes(m?.role) && typeof m.content === "string" && m.content.trim() && m.content.length <= MAX_MESSAGE);
  if (!ok) throw badRequest(`Each message must be text of up to ${MAX_MESSAGE} characters.`);
  if (messages.at(-1).role !== "user") throw badRequest("The last message must be yours.");
  if (system !== undefined && system !== "" && (typeof system !== "string" || system.length > MAX_MESSAGE)) throw badRequest(`The system prompt is limited to ${MAX_MESSAGE} characters.`);
  if (language !== undefined && language !== "" && !CHAT_LANGUAGES.has(language)) throw badRequest("Choose a language.");
  const tokens = Number(max_tokens) || 256;
  if (!Number.isInteger(tokens) || tokens < 16 || tokens > MAX_TOKENS) throw badRequest(`max_tokens must be between 16 and ${MAX_TOKENS}.`);
  const temp = temperature === undefined ? 0.1 : Number(temperature);
  if (!(temp >= 0 && temp <= 1)) throw badRequest("temperature must be between 0 and 1.");
  const params = {
    messages: [...(system ? [{ role: "system", content: system }] : []), ...messages.map((m) => ({ role: m.role, content: m.content }))],
    ...(language ? { language } : {}),
    max_tokens: tokens,
    temperature: temp,
    user,
  };
  const { result, ms } = await timed(() => client.chat(params));
  return { response: result, ms };
}

export async function playTranscribe(client, { audio, language, user } = {}) {
  if (typeof audio !== "string" || !audio) throw badRequest("Record or upload a clip first.");
  if (audio.length > MAX_AUDIO_BASE64) throw badRequest("The playground takes clips of up to 30 seconds.");
  if (!ASR_LANGUAGES.has(language)) throw badRequest("Choose a language.");
  const { result, ms } = await timed(() => client.transcribe({ audio, language, user }));
  return { response: result, ms };
}

// Works in Workers and browsers (no Buffer).
function base64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function playSpeak(client, { text, language, engine, user } = {}) {
  if (typeof text !== "string" || !text.trim()) throw badRequest("Type some text first.");
  if (text.length > MAX_SPEECH_TEXT) throw badRequest(`The playground reads up to ${MAX_SPEECH_TEXT} characters at a time.`);
  if (!SPEECH_LANGUAGES.has(language)) throw badRequest("Choose a language.");
  const voiceEngine = engine || "auto";
  if (!SPEECH_ENGINES.has(voiceEngine)) throw badRequest("Choose an engine.");
  const { result, ms } = await timed(() => client.speak({ text, language, engine: voiceEngine, user }));
  // The SDK returns the audio as bytes; the browser gets base64 and the rest of the response as-is.
  const { audio, ...rest } = result;
  return { response: { ...rest, audio_bytes: audio.length }, audio: base64(audio), ms };
}
