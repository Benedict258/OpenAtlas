import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, systemPrompt } from "../dist/index.js";

const spec = { language: "ha", role: "You triage notes.", task: "Classify it." };

test("systemPrompt: base layer, then the task sections in order", () => {
  const s = systemPrompt({ ...spec, reference: "- a fact", format: "Category: x", example: "Q → A" });
  assert.match(s, /^# Role\nYou are an assistant inside an app built on N-ATLaS\. You triage notes\./);
  assert.match(s, /2\. Write your reply in Hausa\. Keep any labels shown in the Output format exactly as written, in English/);
  const order = ["# Role", "# Rules", "# Task", "# Reference notes", "# Output format", "# Example"].map((h) => s.indexOf(h));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every((i) => i >= 0));
});

test("systemPrompt: optional sections are left out", () => {
  const s = systemPrompt(spec);
  assert.ok(!s.includes("# Reference notes") && !s.includes("# Output format") && !s.includes("# Example"));
});

test("systemPrompt: rejects an unknown language", () => {
  assert.throws(() => systemPrompt({ ...spec, language: "fr" }), TypeError);
});

test("buildPrompt: plain input without a reminder", () => {
  const m = buildPrompt(spec, "Hello");
  assert.equal(m.length, 2);
  assert.equal(m[0].role, "system");
  assert.deepEqual(m[1], { role: "user", content: "Hello" });
});

test("buildPrompt: reminder after the input, with {language} filled in", () => {
  const m = buildPrompt({ ...spec, inputLabel: "Customer message:", reminder: "Reply in {language}." }, "Hello");
  assert.equal(m[1].content, "Customer message:\nHello\n\nReply in Hausa.");
});
