// Education kit logic: chat() reframed by level and language; wrong answers go back via reportIssue().
// Used by this kit's server.mjs and by the OpenAtlas website's live demo.

const LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const LEVELS = {
  primary: "a primary-school pupil (about 8–11 years old). Use very simple words, short sentences and one everyday example.",
  secondary: "a secondary-school student (about 12–17 years old). Explain the key idea clearly, define any technical terms, and give one worked example.",
};
const MAX_TEXT = 4_000;

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
const text = (v, name) => {
  if (typeof v !== "string" || !v.trim()) throw badRequest(`${name} is required.`);
  if (v.length > MAX_TEXT) throw badRequest(`${name} is limited to ${MAX_TEXT} characters.`);
  return v;
};

export async function explain(client, { question, language, level, user } = {}) {
  text(question, "A question");
  if (!LANGUAGES.has(language)) throw badRequest("Choose a language.");
  if (!LEVELS[level]) throw badRequest("Choose a level.");
  // Same chat() call as every other kit; only the instructional framing changes.
  const response = await client.chat({
    messages: [
      { role: "system", content: `You are a patient tutor. Explain the student's question for ${LEVELS[level]}` },
      { role: "user", content: question },
    ],
    language,
    user,
  });
  return { explanation: response.content, model: response.model };
}

export async function report(client, { question, explanation, correction, language, user } = {}) {
  return client.reportIssue({
    kind: "chat",
    input: text(question, "The question"),
    output: text(explanation, "The explanation"),
    correction: text(correction, "A correction"),
    language: LANGUAGES.has(language) ? language : undefined,
    user,
  });
}
