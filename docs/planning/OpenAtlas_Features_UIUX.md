# OpenAtlas — Features & UI/UX Document

Purpose: define what a developer and a judge actually see and interact with — the SDK's developer experience, the starter kits' interfaces, and the documentation surface. OpenAtlas is a developer-tooling product: what is judged is the SDK's capability surface (`chat`, `transcribe`, `normalizeText`, `reportIssue`, stretch `speak`), not where the models are hosted. Hosting appears nowhere in the developer experience — a developer holds one OpenAtlas key and one URL, and the GPU host behind them can change without them noticing (see Architecture §1). "UI/UX" here mostly means **developer experience (DX)**: what it feels like to install, call, and build on the SDK, plus the minimal end-user-facing screens of the three starter kits. This document excludes visual styling (colors/branding) for the starter kits, consistent with the convention used across this project's other UI/UX docs.

---

## 1. Primary Surface: The SDK Developer Experience

OpenAtlas's main "interface" is a terminal and a code editor, not a screen. The product's UX bar is: **a developer with no prior N-ATLaS experience should get a real response from a real N-ATLaS model within five minutes of finding the README.**

### 1.1 Installation
```
npm install openatlas
```
No account setup beyond requesting an API key (documented as a short, explicit step — not hidden behind a dashboard that doesn't exist yet for this submission).

### 1.2 Quickstart Shape (what the README shows first)
```ts
import { OpenAtlas, normalizeText } from "openatlas";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });

// Repairs corrupted special characters (e.g. Turkish "ş" typed for Yoruba "ṣ") before sending.
const question = normalizeText("Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?", { language: "yo" });

const response = await client.chat({
  messages: [{ role: "user", content: question }],
  user: "your-end-user-id", // required: counts active users against the license cap
});

console.log(response.content);
```
This is the single most important UX artifact in the whole project: it has to be copy-pasteable and work on the first try against the live hosted endpoint. Everything else in the SDK design serves this moment.

### 1.3 Method Surface (Developer-Facing API)

| Method | Purpose | Minimal required input |
|---|---|---|
| `client.chat({ messages, user, language? })` | N-ATLaS text generation in English or a Nigerian language — no model-format knowledge needed | A messages array + an end-user ID |
| `client.transcribe({ audio, language, user })` | Speech-to-text, auto-routed to the right one of 4 N-ATLaS ASR models by language code | Audio + a language code + an end-user ID |
| `normalizeText(text, { language? })` (also `client.normalizeText`) | Repairs corrupted Nigerian-language characters (encoding damage, look-alike letters, invisible characters). Local, no network | A string |
| `client.reportIssue({ kind, input, output, correction })` | Flags a bad N-ATLaS output with a correction; contributes it to an exportable correction dataset | The original input, the bad output, the correction |
| `client.speak({ text, language })` (stretch) | The ElevenLabs gap for Nigerian languages: spoken Hausa/Yoruba/Igbo/Pidgin from text | Text + a language code |

`user` is required on `chat` and `transcribe`. N-ATLaS's license counts *end users* (the people interacting with its output) against a 1,000-per-30-days cap, so the gateway needs a stable, opaque per-end-user ID to measure that honestly. It is hashed before storage.

Setting `new OpenAtlas({ normalize: true })` applies `normalizeText()` automatically to chat inputs/outputs and transcripts.

`normalizeText()` cleans what is there; it does not add tone marks that were never typed. The docs say so next to the method, so a developer isn't surprised. N-ATLaS-based tone restoration (asking N-ATLaS itself to re-add missing marks) is a roadmap item only, not part of this build.

### 1.4 Error Handling UX
- Errors are typed and human-readable (`OpenAtlasAPIError`, `OpenAtlasTimeoutError`), not raw HTTP stack traces — a developer debugging a cold-start timeout should immediately understand what happened and what to do (retry, or expect first-call latency), not guess.
- First-request latency (model loading on the GPU host) is documented up front in the README's "what to expect" section, not discovered the hard way.
- If the GPU backend is unreachable, the gateway returns a clear `backend_unavailable` error rather than a hang.

### 1.5 Documentation Structure
1. **Quickstart** (copy-paste example, above)
2. **Why OpenAtlas** (one paragraph — what gap this fills, linking back to the white paper's framing)
3. **API Reference** (each method, parameters, return shape, example)
4. **Language codes reference** (`ha`, `yo`, `ig`, `en-ng` — mapped clearly to which ASR model each one calls)
5. **Text normalization** (exactly what `normalizeText()` repairs, with before/after examples, and what it does not do)
6. **Contributing corrections** (what `reportIssue()` stores, that it is opt-in, and how apps should tell their users)
7. **Starter kits** (links to all three, with a one-line description of what each demonstrates)
8. **Known limitations** (first-request latency, non-commercial license cap, `speak()` stretch status, `normalizeText()` scope) — stated plainly, not buried

---

## 2. Starter Kit Interfaces

Each starter kit is intentionally minimal — a single-screen or single-script interface, built to prove the SDK call path works, not to be a polished product. All three deliberately share the same visual simplicity so a judge can recognize the pattern across them without relearning a new interface each time.

### 2.1 Citizen Services Starter Kit
**Interface:** single-page form.
```
┌────────────────────────────────────┐
│  OpenAtlas — Citizen Services Demo  │
├────────────────────────────────────┤
│  [ Language: Yoruba ▾ ]              │
│  [ Ask a question about... ]         │
│  ┌──────────────────────────────┐   │
│  │ (text input)                   │   │
│  └──────────────────────────────┘   │
│  [ Ask ]                             │
├────────────────────────────────────┤
│  Response:                           │
│  "..."                               │
└────────────────────────────────────┘
```
- Language selector drives both the prompt framing and which N-ATLaS language context is used.
- The question is passed through `normalizeText()` before `chat()`, so pasted text with broken characters still matches the demo dataset.
- A small, fixed demo dataset (e.g. 5–10 common civic questions and reference facts) is injected as context so the response isn't generic — this is clearly labeled in the UI as a "demo dataset," not a real civic-info system.

### 2.2 Education Starter Kit
**Interface:** single-page tutor chat.
```
┌────────────────────────────────────┐
│  OpenAtlas — Education Demo          │
├────────────────────────────────────┤
│  [ Language: Hausa ▾ ]  [ Level: ▾ ] │
│  ┌──────────────────────────────┐   │
│  │ Ask something to learn...      │   │
│  └──────────────────────────────┘   │
│  [ Explain ]                         │
├────────────────────────────────────┤
│  Explanation:                        │
│  "..."                               │
└────────────────────────────────────┘
```
- A "Level" selector (e.g. primary / secondary) demonstrates that the same `chat()` call can be reframed by prompt context — showing the SDK's flexibility, not a new feature.
- A **"Report a wrong answer"** link under each explanation opens a small box for the correct answer and calls `reportIssue()`. The UI states that the report (question, answer, correction) is sent to OpenAtlas as a correction for N-ATLaS.

### 2.3 Customer Service Starter Kit
**Interface:** voice-note intake + drafted response.
```
┌────────────────────────────────────┐
│  OpenAtlas — Customer Service Demo   │
├────────────────────────────────────┤
│  [ 🎙 Record voice note ]            │
│  (or) [ Upload audio file ]          │
│  [ Language: Igbo ▾ ]                │
├────────────────────────────────────┤
│  Transcribed:                        │
│  "..."                               │
│                                       │
│  Drafted response:                   │
│  "..."                               │
│                                       │
│  [ ✎ Correct this transcript ]       │
│  (stretch) [ ▶ Play response audio ] │
└────────────────────────────────────┘
```
- This is the one starter kit that visibly chains `transcribe()` → `chat()` (and, if shipped, → `speak()`), making the full pipeline legible to a judge in one screen: raw voice in, transcript shown, draft response shown, optionally spoken back.
- **"Correct this transcript"** lets the user fix the transcript and submit it with the audio via `reportIssue()` — the most valuable kind of contribution (audio paired with a human-corrected transcript), stated as such in the UI.
- The "Play response audio" control only appears if the TTS stretch component is confirmed and shipped — its absence is not treated as a bug, just a feature that depends on NAIC's eligibility answer.

---

## 3. Cross-Cutting UX Principles

- **Show the pipeline, don't hide it.** Every starter kit visibly displays each intermediate step (e.g. the transcript before the response) rather than collapsing straight to a final answer — this is deliberate, because the judging criteria care about *genuine* N-ATLaS use, and a visible pipeline is the clearest way to demonstrate that nothing is being faked or swapped for a general-purpose model behind the scenes.
- **Label demo-scale honestly, everywhere it appears.** Any fixture dataset, any non-production shortcut, is labeled in the UI itself ("demo dataset," "sample only") — consistent with the honesty standard held across every other project this cycle.
- **One shared visual language across all three starter kits.** Same layout skeleton, same minimal styling, so the three read as one coherent toolkit rather than three unrelated demos — reinforcing that they're all proof points of the same underlying SDK, not three separate products.
- **The SDK's DX is the real UI.** For this submission, polish effort is weighted toward the quickstart example, the error messages, and the documentation clarity — not toward making the starter kits visually impressive. A judge evaluating developer infrastructure should come away able to use it themselves, which is a documentation and API-design outcome, not a visual-design one.

---

## 4. Explicit Non-Goals (UI/UX)

- No account dashboard, usage analytics UI, or billing UI — out of scope for this submission.
- No mobile app or mobile-optimized starter kit UI.
- No visual branding/design system pass on the starter kits — functional clarity only, per the convention of leaving palette/typography decisions to a separate design pass not needed for this submission.
- No multi-language UI chrome (the starter kits' own interface labels stay in English; only the *content* being processed is multilingual) — keeps the demo surface simple and focused on proving the SDK, not building a localized product shell.
