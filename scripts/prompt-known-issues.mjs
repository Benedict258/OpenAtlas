// Re-runs the known-issue cases behind the system-prompt change through the kits' own code (not the
// evaluation script's copies), against the live gateway and real N-ATLaS:
//   KI-1   Citizen Services, Hausa airfare question (outside the demo notes)
//   KI-12  Customer Service, the real 51 s Yoruba voice note and the 26.7 s Hausa note (speech → draft)
// Usage (repo root): node --env-file=.env scripts/prompt-known-issues.mjs

import { readFileSync } from "node:fs";
import { OpenAtlas } from "../sdk/dist/index.js";
import { ask } from "../starter-kits/citizen-services/kit.mjs";
import { ticket } from "../starter-kits/customer-service/kit.mjs";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_TEST_KEY, baseURL: process.env.OPENATLAS_BASE_URL, maxRetries: 1 });
const health = await fetch(`${process.env.OPENATLAS_BASE_URL}/v1/health`).then((r) => r.json());
if (health.backend?.mock) throw new Error("Gateway is pointed at the MOCK backend.");
console.log("backend", health.backend?.host);
const CATEGORIES = ["billing", "delivery", "product issue", "account", "other"];
const user = "known-issue-check";

let t0 = Date.now();
const a = await ask(client, { question: "Nawa ne kuɗin tikitin jirgin sama daga Kano zuwa Legas?", language: "ha", user });
console.log(`\nKI-1 airfare (ha), ${((Date.now() - t0) / 1000).toFixed(1)} s\n${a.answer}`);

for (const [label, file, language] of [
  ["KI-12 Yoruba 51 s note", "test-audio/eval/51s.wav", "yo"],
  ["KI-12 Hausa 26.7 s note", "test-audio/ha.wav", "ha"],
]) {
  t0 = Date.now();
  const audio = readFileSync(file).toString("base64");
  const r = await ticket(client, { audio, language, user });
  const lines = r.draft.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const value = (name) => lines.find((l) => l.toLowerCase().startsWith(name + ":"))?.slice(name.length + 1).trim().toLowerCase();
  const checks = {
    three_english_labels: Boolean(value("category") !== undefined && value("urgency") !== undefined && value("draft reply") !== undefined),
    category_allowed: CATEGORIES.includes(value("category")),
    urgency_allowed: ["low", "medium", "high"].includes(value("urgency")),
  };
  console.log(`\n${label}, ${((Date.now() - t0) / 1000).toFixed(1)} s, ${r.asrModel} → ${r.llmModel}\n${JSON.stringify(checks)}\nTRANSCRIPT: ${r.transcript}\nDRAFT:\n${r.draft}`);
}
