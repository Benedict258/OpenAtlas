// The Customer Service kit's text chat (converse() in starter-kits/customer-service/kit.mjs), run as
// real multi-turn conversations through the gateway in all four languages. Prints every turn for
// reading; results: docs/REPORT.md, section 31.
// What to check by hand: replies use the earlier turns; delivery, returns, payment and opening hours
// match the kit's sample policies; no order is ever said to be checked, found, shipped or delayed; no
// invented contact details.
// Usage (repo root): node --env-file=.env scripts/support-chat-check.mjs [runs]
// Needs OPENATLAS_TEST_KEY (or OPENATLAS_API_KEY) and OPENATLAS_BASE_URL.

import { OpenAtlas } from "../sdk/dist/index.js";
import { converse } from "../starter-kits/customer-service/kit.mjs";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_TEST_KEY ?? process.env.OPENATLAS_API_KEY, baseURL: process.env.OPENATLAS_BASE_URL });
const CONVERSATIONS = [
  ["en-ng", ["I paid for my order 4 days ago and it hasn't arrived. I'm in Ibadan.", "My order number is AS-2291. When will it come?", "Can I return it if the blender is broken when it arrives?"]],
  ["en-ng", ["Hi, my blender arrived broken yesterday. What can I do?", "How long does the refund take?"]],
  ["ha", ["Na biya kudin oda ta kwana uku da suka wuce amma ba ta zo ba.", "Lambar oda ta ita ce AS-1180."]],
  ["yo", ["Mo fẹ́ dá ohun tí mo rà padà, ó ti bàjẹ́."]],
  ["ig", ["Kedu oge unu na-emeghe ụlọ ahịa?"]],
];

const runs = Number(process.argv[2]) || 1;
for (let run = 1; run <= runs; run++) {
  for (const [language, turns] of CONVERSATIONS) {
    const messages = [];
    for (const text of turns) {
      messages.push({ role: "user", content: text });
      const started = Date.now();
      const r = await converse(client, { messages, language, user: "support-chat-check" });
      messages.push({ role: "assistant", content: r.reply });
      console.log(`[run ${run} · ${language}] customer: ${text}`);
      console.log(`[run ${run} · ${language}] reply (${Date.now() - started} ms, ${r.model}, ${r.turns} turns sent): ${r.reply}\n`);
    }
  }
}
