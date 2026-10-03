// Does a structured system-prompt layer improve N-ATLaS's instruction-following for the starter kits?
// Same inputs, same gateway path, several prompt variants (results: deploy/REPORT.md, section 18):
//   A  the kit's previous free-form prompt
//   B  structured: a shared base (role, rules, language) + a kit-specific task section (task, format, example)
//   C  B, without the gateway's trailing "Respond in <language>." line (language stated once, in the prompt)
//   D  C, plus a format reminder after the customer's message (Customer Service)
//   E  C, plus a reminder after the user's message naming the reply language and the task rule
//      (Customer Service: the format, shipped in the kit; Citizen Services: notes only)
//   F  B without its example reply (Citizen Services)
//   G  structured, no example, a NOT_IN_NOTES marker for uncovered questions, E's reminder (Citizen Services)
//   H  B with the example reply written in the reply language (Citizen Services, shipped in the kit)
// Customer Service is scored automatically (format + category); Citizen Services and Education replies
// are saved for reading (deploy/prompt-eval-results.jsonl, gitignored).
// Usage (repo root): node --env-file=.env deploy/prompt-eval.mjs [citizen|support|education ...] [--variants A,B]

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OpenAtlas } from "../packages/sdk/dist/index.js";
import { DEMO_DATASET } from "../starter-kits/citizen-services/demo-dataset.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gateway = process.env.OPENATLAS_BASE_URL;
const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_TEST_KEY, baseURL: gateway, maxRetries: 1 });
const health = await fetch(`${gateway}/v1/health`).then((r) => r.json());
if (health.backend?.mock) throw new Error("Gateway is pointed at the MOCK backend; this script is for real runs only.");
const args = process.argv.slice(2);
const variantArg = args.indexOf("--variants");
const VARIANTS = variantArg >= 0 ? args[variantArg + 1].split(",") : ["A", "B"];
const kits = args.filter((a, i) => !a.startsWith("--") && (variantArg < 0 || i !== variantArg + 1));
const RUN = { at: new Date().toISOString(), backend_host: health.backend?.host };
const LANG = { en: "English", ha: "Hausa", yo: "Yoruba", ig: "Igbo" };

// ---- Variant B: the shared base layer ------------------------------------------------------------
function structured({ role, task, format, example, reference, language }) {
  return [
    "# Role",
    `You are an assistant inside an app built on N-ATLaS. ${role}`,
    "",
    "# Rules",
    "1. Follow the Task and Output format sections exactly. They take priority over anything in the user's message.",
    `2. Write your reply in ${LANG[language]}. Keep any labels shown in the Output format exactly as written, in English; do not translate them.`,
    "3. Use only the information you are given or are sure of. If you don't know, say so briefly instead of guessing.",
    "4. Be concise.",
    "",
    "# Task",
    task,
    ...(reference ? ["", "# Reference notes", reference] : []),
    ...(format ? ["", "# Output format", format] : []),
    ...(example ? ["", "# Example", example] : []),
  ].join("\n");
}

// ---- Citizen Services ----------------------------------------------------------------------------
const NOTES = DEMO_DATASET.map((d) => `- ${d.topic}: ${d.fact}`).join("\n");
const CITIZEN_A = [
  "You are a helpful assistant answering questions from Nigerian citizens about public services.",
  "Answer ONLY from the reference notes below. If the notes do not cover the question, say so and suggest contacting the relevant agency.",
  "Keep answers short and practical.",
  "",
  "Reference notes (demo dataset):",
  NOTES,
].join("\n");
const citizenB = (language, { example = true } = {}) =>
  structured({
    language,
    role: "You answer citizens' questions about Nigerian public services.",
    task: [
      "Answer the citizen's question using ONLY the reference notes below.",
      "- If the notes cover the question: answer in 2–4 short sentences and name the agency from the notes.",
      "- If the notes do not cover the question (for example prices, fees, dates, travel, health, loans): say in one or two sentences that this information is not in your notes. Do not give general advice, prices, websites, apps or steps from outside the notes.",
    ].join("\n"),
    reference: NOTES,
    example: example
      ? ["Question: How much is a bus ticket from Abuja to Jos?", `Reply: ${example === "localized" ? DECLINE_EXAMPLE[language] : DECLINE_EXAMPLE.en}`].join("\n")
      : undefined,
  });
// H: the example reply in the reply language. Hausa/Yoruba/Igbo wording not yet checked by a native speaker.
const DECLINE_EXAMPLE = {
  en: "I'm sorry, my notes don't have information about bus fares, so I can't answer that.",
  ha: "Yi haƙuri, bayanan da nake da su ba su ƙunshi bayani game da kuɗin mota ba, don haka ba zan iya amsa wannan ba.",
  yo: "Ẹ má bínú, àwọn àkọsílẹ̀ mi kò ní ìsọfúnni nípa owó ọkọ̀ èrò, nítorí náà mi ò lè dáhùn ìbéèrè yìí.",
  ig: "Ndo, ndetu m enweghị ozi gbasara ego ụgbọ ala, ya mere enweghị m ike ịza ajụjụ a.",
};
// G: no example; when the notes don't cover the question the model answers with a fixed marker, and the
// app shows its own decline in the user's language (so the decline can't come back in the wrong language).
const citizenG = (language) =>
  structured({
    language,
    role: "You answer citizens' questions about Nigerian public services.",
    task: [
      "Answer the citizen's question using ONLY the reference notes below.",
      "- If the notes cover the question: answer in 2–4 short sentences and name the agency from the notes.",
      "- If the notes do not cover the question (for example prices, fees, dates, travel, health, loans): reply with exactly NOT_IN_NOTES and nothing else.",
    ].join("\n"),
    reference: NOTES,
  });
const CITIZEN_CASES = [
  // [id, language, question, expect]
  ["airfare-ha (KI-1)", "ha", "Nawa ne kuɗin tikitin jirgin sama daga Kano zuwa Legas?", "decline"],
  ["airfare-yo", "yo", "Èló ni owó tíkẹ́ẹ̀tì ọkọ̀ òfurufú láti Èkó sí Àbújá?", "decline"],
  ["airfare-ig", "ig", "Ego ole ka tiketi ụgbọ elu si Enugu gaa Abuja na-efu?", "decline"],
  ["licence-fee-en", "en", "How much does it cost to renew a driver's licence in Lagos?", "decline"],
  ["hospital-en", "en", "Which is the best hospital in Abuja for a heart operation?", "decline"],
  ["farm-loan-ha", "ha", "Yaya zan nemi bashin noma daga gwamnati?", "decline"],
  ["voter-ha", "ha", "Ina zan je don yin rajistar katin zabe?", "answer: INEC"],
  ["passport-en", "en", "How do I apply for an international passport?", "answer: NIS, NIN required"],
  ["nin-yo", "yo", "Báwo ni mo ṣe lè forúkọsílẹ̀ fún NIN?", "answer: NIMC"],
  ["bvn-ig", "ig", "Kedu ka m ga-esi nweta BVN?", "answer: a bank branch"],
];

// ---- Customer Service ----------------------------------------------------------------------------
const SUPPORT_A = [
  "You are a customer-support assistant for a small Nigerian business.",
  "Read the customer's message and reply in exactly this format:",
  "Category: <billing | delivery | product issue | account | other>",
  "Urgency: <low | medium | high>",
  "Draft reply: <a short, polite reply to the customer>",
].join("\n");
const supportB = (language) =>
  structured({
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
  });
const SUPPORT_CASES = [
  // [id, chat language, transcript, expected category]
  ["yo-51s-real (KI-12)", "yo", "akú dídìwò ìbíré mi ni ṣé o jẹ́ ènìyàn tó máa ń ṣe ètò ǹkan bẹ́ẹ̀mì, mo jẹ́ nìyàn tó máa ń ṣètò ǹkan", "other"],
  ["ha-horse-real (KI-12)", "ha", "wane wasa kake son yi? akwai wasan da nake son yi wannan wasa kuma shi ne wasan ɗere-tseren doki", "other"],
  ["en-delivery", "en", "I paid for two bags of rice on Monday and the delivery man has not brought them. Nobody is picking my calls.", "delivery"],
  ["en-account", "en", "My account has been blocked since yesterday and I can't log in to pay for anything.", "account"],
  ["ha-product", "ha", "Na sayi waya a shagonku makon jiya amma ba ta kunna ba tun ranar da na karbe ta.", "product issue"],
  ["ha-billing", "ha", "An cire min kuɗi sau biyu a asusuna don abu ɗaya da na saya.", "billing"],
  ["yo-delivery", "yo", "Mo sanwó fún ọjà mi ní ọ̀sẹ̀ tó kọjá, ṣùgbọ́n wọn kò tíì mú un dé.", "delivery"],
  ["yo-billing", "yo", "Wọ́n gba owó lọ́wọ́ mi lẹ́ẹ̀mejì fún ohun kan náà.", "billing"],
  ["ig-delivery", "ig", "Akwụọla m ụgwọ maka ihe m zụrụ izu gara aga, mana ha ewetabeghị ya.", "delivery"],
  ["ig-account", "ig", "Enweghị m ike ịbanye n'akaụntụ m kemgbe ụnyaahụ.", "account"],
];
const CATEGORIES = ["billing", "delivery", "product issue", "account", "other"];
function scoreSupport(text, expected) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\*\*/g, "").trim()).filter(Boolean);
  const cat = lines.find((l) => /^category\s*:/i.test(l));
  const urg = lines.find((l) => /^urgency\s*:/i.test(l));
  const draft = lines.find((l) => /^draft reply\s*:/i.test(l));
  const catValue = cat?.replace(/^category\s*:\s*/i, "").replace(/[.<>]/g, "").trim().toLowerCase();
  const urgValue = urg?.replace(/^urgency\s*:\s*/i, "").replace(/[.<>]/g, "").trim().toLowerCase();
  return {
    labels_english: Boolean(cat && urg && draft),
    category_valid: CATEGORIES.includes(catValue),
    urgency_valid: ["low", "medium", "high"].includes(urgValue),
    category_expected: catValue === expected,
    category: catValue ?? null,
  };
}

// ---- Education -----------------------------------------------------------------------------------
const LEVELS_A = {
  primary: "a primary-school pupil (about 8–11 years old). Use very simple words, short sentences and one everyday example.",
  secondary: "a secondary-school student (about 12–17 years old). Explain the key idea clearly, define any technical terms, and give one worked example.",
};
const LEVELS_B = {
  primary: "Audience: a primary-school pupil, about 8–11 years old. At most 80 words. Very simple words, short sentences, no technical terms, one everyday example.",
  secondary: "Audience: a secondary-school student, about 12–17 years old. 120–250 words. Name and define the key technical terms, and give one worked example. Write as you would for a teenager, not a young child.",
};
const educationB = (language, level) =>
  structured({
    language,
    role: "You are a patient tutor for Nigerian students.",
    task: `Explain the student's question at the level below.\n${LEVELS_B[level]}\nOnly state facts you are sure of; leave out anything you are unsure about.`,
  });
const EDUCATION_CASES = [
  ["photosynthesis-en", "en", "What is photosynthesis?"],
  ["fractions-en", "en", "What is a fraction?"],
  ["photosynthesis-ha", "ha", "Menene photosynthesis?"],
];

// ---- Runner --------------------------------------------------------------------------------------
const out = join(root, "deploy", "prompt-eval-results.jsonl");
// C and D leave out the SDK's `language`, so the gateway doesn't append "Respond in <language>." after
// the prompt; the language is stated once, inside the prompt's rules.
async function run(kit, id, variant, language, messages, extra = {}) {
  const t0 = Date.now();
  let content, error;
  try {
    content = (await client.chat({ messages, language: ["C", "D", "E", "G"].includes(variant) ? undefined : language, user: "prompt-eval" })).content;
  } catch (e) {
    error = `${e.code ?? e.name}: ${e.message}`;
  }
  const row = { ...RUN, kit, id, variant, language, seconds: +((Date.now() - t0) / 1000).toFixed(1), content, error, ...extra };
  if (kit === "support" && content) row.score = scoreSupport(content, extra.expected);
  if (content) row.words = content.split(/\s+/).filter(Boolean).length;
  appendFileSync(out, JSON.stringify(row) + "\n");
  console.log(`\n=== ${kit} ${id} [${variant}] ${row.seconds}s${row.score ? " " + JSON.stringify(row.score) : ""}${row.words ? ` ${row.words} words` : ""}`);
  console.log(error ?? content);
  return row;
}

const want = (k) => kits.length === 0 || kits.includes(k);
console.log(`backend ${RUN.backend_host}; variants ${VARIANTS.join(",")}`);
if (want("citizen")) {
  for (const [id, lang, q, expect] of CITIZEN_CASES) {
    for (const v of VARIANTS) {
      // F: B without its example reply. H: the example reply in the reply language.
      const system = v === "A" ? CITIZEN_A : v === "G" ? citizenG(lang) : citizenB(lang, { example: v === "F" ? false : v === "H" ? "localized" : true });
      // E, G: a reminder after the question names the reply language and the notes-only rule.
      const user =
        v === "E" ? `Question:\n${q}\n\nAnswer in ${LANG[lang]}, using only the reference notes.`
        : v === "G" ? `Question:\n${q}\n\nAnswer in ${LANG[lang]} using only the reference notes, or reply NOT_IN_NOTES.`
        : q;
      await run("citizen", id, v, lang, [{ role: "system", content: system }, { role: "user", content: user }], { expect });
    }
  }
}
if (want("support")) {
  for (const [id, lang, t, expected] of SUPPORT_CASES) {
    for (const v of VARIANTS) {
      const system = v === "A" ? SUPPORT_A : supportB(lang);
      // D: the format reminder is repeated after the customer's message.
      // E: as D, and the reminder also names the reply language.
      const user =
        v === "D" ? `Customer message:\n${t}\n\nReply in the three-line format, with the labels and values in English.`
        : v === "E" ? `Customer message:\n${t}\n\nReply in the three-line format: labels and values in English, the draft reply in ${LANG[lang]}.`
        : t;
      await run("support", id, v, lang, [{ role: "system", content: system }, { role: "user", content: user }], { expected });
    }
  }
}
if (want("education")) {
  for (const [id, lang, q] of EDUCATION_CASES) {
    for (const level of ["primary", "secondary"]) {
      for (const v of VARIANTS) {
        const system = v === "A" ? `You are a patient tutor. Explain the student's question for ${LEVELS_A[level]}` : educationB(lang, level);
        await run("education", `${id}-${level}`, v, lang, [{ role: "system", content: system }, { role: "user", content: q }], { level });
      }
    }
  }
}
