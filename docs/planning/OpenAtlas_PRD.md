# OpenAtlas — Product Requirements Document

**Track:** National AI Innovation Challenge (NAIC) 2026 — Academia & Research, Developer Infrastructure problem statement (Developer Tooling)
**Submission deadline:** October 12, 2026, 11:59 PM WAT
**Build window:** ~10 days (shared with the BUILD Conference Oct 7 deadline for a separate project)

---

## 0. Build Approach Note

OpenAtlas is not an application built on N-ATLaS. It is the developer tooling that makes building applications on N-ATLaS fast. What the judges evaluate is the **SDK's capability surface** — what a developer can do with it — plus the starter kits that prove it works end to end. Where the models are hosted is an implementation detail, documented in the Architecture document, not a product feature.

Honesty standard, applied throughout: no feature is described as working unless it has been run against real N-ATLaS models and real input/output observed.

---

## 1. Overview

### 1.1 Core Value Proposition
One TypeScript SDK that turns N-ATLaS — Nigeria's sovereign LLM and its four ASR models — into a small set of methods a developer can use in minutes:

- **`chat()`** — N-ATLaS text generation in English, Hausa, Yoruba, or Igbo. One method; no model-format knowledge required.
- **`transcribe()`** — speech-to-text, auto-routed to the correct one of 4 N-ATLaS ASR models by language code. One method instead of four model interfaces.
- **`normalizeText()`** — repairs Nigerian-language text whose special characters were corrupted by typing or scraping.
- **`reportIssue()`** — flags a bad N-ATLaS output with a correction, turning every app into an opt-in data-contribution pipeline.
- **`speak()`** *(stretch, gated on NAIC eligibility)* — **the ElevenLabs gap for Nigerian languages**: no accessible API today generates spoken Hausa, Yoruba, Igbo, or Pidgin; `speak()` closes that gap the way ElevenLabs did for English.

### 1.2 Primary Target Users
- **Nigerian/West African developers** building citizen-facing, educational, or customer-service tools who want local-language AI without ML infrastructure work.
- **Academic/research teams** who want a documented way to build on N-ATLaS — and, via `reportIssue()`, a way to collect corrected local-language data from real use.
- **NAIC judges**, evaluating whether the submission genuinely uses N-ATLaS as its reasoning/transcription engine.

### 1.3 Feature Table

| Feature | What it is | Why (real problem) | Priority |
|---|---|---|---|
| **`chat()`** | N-ATLaS LLM completion; applies the model's tested inference settings (repetition penalty 1.12, current date into the chat template) | Calling N-ATLaS correctly requires model-specific knowledge a newcomer won't have | Must-have |
| **`transcribe()`** | Speech-to-text routed by language code (`ha`, `yo`, `ig`, `en-ng`) to the matching N-ATLaS ASR model | Four separate checkpoints with separate interfaces | Must-have |
| **`normalizeText()`** | Deterministic text cleanup: encoding (mojibake) repair, look-alike character substitution (e.g. `ş`→`ṣ`, `ķ`→`ƙ`), invisible-character removal, Unicode NFC, optional Hausa apostrophe conventions (`k'asa`→`ƙasa`) | Nigerian-language diacritics and special letters are routinely lost or corrupted in electronic text (Orife 2018; Ezeani et al. 2016) | Must-have |
| **`reportIssue()`** | Records `{input, output, correction, language}` (+ optional audio) for a bad N-ATLaS output in the OpenAtlas database; exportable by the operator | The field's bottleneck is newly contributed data; most work reuses the same scarce datasets (Joshi et al. 2020; Nekoto et al. 2020) | Must-have |
| **Starter kit — Citizen Services** | Local-language Q&A over a small demo civic-info dataset | Proves `chat()` + `normalizeText()` | Must-have |
| **Starter kit — Education** | Local-language tutoring/explanation flow | Proves `chat()` with instructional framing + `reportIssue()` | Must-have |
| **Starter kit — Customer Service** | Voice note → transcript → classified, drafted reply | Proves `transcribe()` → `normalizeText()` → `chat()` chained, + `reportIssue()` | Must-have |
| **`speak()`** | Final-stage TTS rendering of already-generated text (sorotts primary, MMS-TTS fallback) | The ElevenLabs gap for Nigerian languages | Stretch — gated on NAIC eligibility email |
| **Docs** | README quickstart, API reference, architecture explanation | A judge must be able to make a real call themselves | Must-have |

The service behind the SDK (a gateway issuing OpenAtlas keys, measuring the license cap, and proxying to a GPU host) is required for any of this to work, but it is infrastructure, not a feature — see Architecture §1 and §5.

### 1.4 Core Workflow (Primary Developer Journey)
1. `npm install openatlas`.
2. Initialize the client with an OpenAtlas API key. No GPU, model weights, or hosting credentials on the developer's side.
3. Call `chat()` for text in English or a Nigerian language, or `transcribe()` with a language code for speech-to-text. Optionally pass text through `normalizeText()` first (or set `normalize: true` on the client).
4. When an output is wrong, call `reportIssue()` with the correction.
5. Optionally clone a starter kit matching their niche and swap in their own content.
6. (Stretch) Call `speak()` to render a final response as audio.

---

## 2. Feature Deep-Dives

### 2.1 `chat()`
- `client.chat({ messages, user, language?, max_tokens?, temperature? })` → `{ content, model, usage }`. OpenAI-style shapes for familiarity.
- **Written fresh for this submission.** There is no pre-existing N-ATLaS client to adapt: an earlier assumption that a tested `natlas.ts` client existed from the Safroi integration was wrong — it does not exist anywhere. The only prior N-ATLaS code is a Colab *server* notebook. What is carried over from that notebook, which ran against the real weights, is its tested inference settings: repetition penalty 1.12; the current date passed to the chat template's `date_string` (otherwise the template silently uses "26 Jul 2024"); and 4-bit NF4 quantization for GPUs that can't hold the model in fp16.
- `language` adds a short "Respond in …" instruction; there is one LLM for all four languages.

### 2.2 `transcribe()`
- `client.transcribe({ audio, language, user })` → `{ text, language, model }`. `audio` is bytes or base64 in any format ffmpeg decodes.
- Language code → model: `ha` → `NCAIR1/Hausa-ASR`, `yo` → `NCAIR1/Yoruba-ASR`, `ig` → `NCAIR1/Igbo-ASR`, `en-ng` → `NCAIR1/NigerianAccentedEnglish` (all Whisper-small fine-tunes).

### 2.3 `normalizeText()`
- `normalizeText(text, { language?, hausaApostrophes? })` → `string`. Exported standalone and as `client.normalizeText()`. Runs locally in the SDK; no network call, no model.
- Optional client setting `normalize: true` applies it automatically to `chat()` inputs/outputs and `transcribe()` outputs.
- What it repairs:
  1. **Encoding damage** — UTF-8 text mis-decoded as Windows-1252/Latin-1 during scraping (`á»` → `ọ`, `Æ™` → `ƙ`).
  2. **Look-alike substitutes** — Hausa: `ķ`→`ƙ`, `ɖ`→`ɗ`; Yoruba/Igbo (when `language` is `yo`/`ig`): cedilla/ogonek stand-ins for dot-below (`ş`→`ṣ`, `ȩ`/`ę`→`ẹ`, `ǫ`→`ọ`, `į`→`ị`, `ų`→`ụ`).
  3. **Invisible characters** — zero-width spaces/joiners, BOM, soft hyphens.
  4. **Unicode composition** — NFC, so the same word compares equal however it was typed.
  5. **Hausa ASCII conventions** (opt-in, `hausaApostrophes: true`) — `b'`/`d'`/`k'` before a vowel → `ɓ`/`ɗ`/`ƙ`. Opt-in because apostrophes also appear as quotes.
- **Not in scope (final for this build):** restoring tone marks or dot-below marks that were never typed. That needs a model (the cited work uses seq2seq and n-gram models). N-ATLaS-based tone restoration (asking N-ATLaS itself to re-add missing marks) is a roadmap item only, not part of this build.

### 2.4 `reportIssue()`
- `client.reportIssue({ kind: "chat" | "transcription", input, output, correction, language?, note?, audio?, user? })` → `{ id, received_at }`.
- Stored in the same database the gateway already uses for keys and license-cap accounting (Cloudflare D1) — no second database. The end-user ID, if given, is hashed; the operator can export reports via an admin endpoint.
- Opt-in by construction: the gateway stores no request content from `chat()`/`transcribe()`; only what an app explicitly sends to `reportIssue()` is kept. Apps should tell their users when a report is submitted.
- Limits: text fields up to 8,000 characters; optional audio up to ~1 MB (base64) for transcription reports, so corrected transcripts can be paired with their audio.
- **Not in scope yet:** an agreed hand-off of these reports to NCAIR/N-ATLaS maintainers. Collection and export are built; the channel is a post-submission goal.

### 2.5 Starter Kits
Three minimal, runnable reference implementations, each exercising the real SDK against the real service:

| Starter Kit | Demonstrates |
|---|---|
| **Citizen Services** | Local-language Q&A over a hardcoded demo civic-info dataset — `chat()` with context injection, `normalizeText()` on the question |
| **Education** | Tutoring-style explanation at a chosen level — `chat()` with instructional framing, "Report a wrong answer" → `reportIssue()` |
| **Customer Service** | Voice note → `transcribe()` → `normalizeText()` → `chat()` to classify and draft a reply; "Correct this transcript" → `reportIssue()` with audio |

Each ships with a short README stating what it proves and what it deliberately doesn't attempt (no persistence, no auth, demo data only).

### 2.6 `speak()` (Stretch, Conditional)
- **Positioning:** the ElevenLabs gap for Nigerian languages. Today there is no accessible API for generating spoken Hausa, Yoruba, Igbo, or Pidgin.
- **Pipeline:** N-ATLaS ASR → N-ATLaS LLM → TTS (final rendering only).
- **TTS candidates:** `Shinzmann/sorotts` (Orpheus-architecture, stated coverage of Yoruba, Hausa, Igbo, Pidgin); Meta MMS-TTS (`facebook/mms-tts-yor` / `-hau` / `-ibo`) as fallback.
- **Boundary:** TTS never reasons or transcribes; N-ATLaS remains the engine.
- **Go/no-go:** proceeds only if the NAIC secretariat confirms the pairing is allowed. Otherwise dropped without weakening the core SDK.

---

## 3. Explicit Non-Goals (For This Submission)

- Production-grade uptime, scaling, or multi-tenant load handling.
- A Python (or any non-TypeScript) SDK — roadmap only.
- Tone/diacritic restoration of any kind in `normalizeText()`, including N-ATLaS-based restoration — roadmap only.
- Deployment-ready applications in any of the three niches.
- Fine-tuning or retraining any N-ATLaS model.
- Any commercial positioning, given the model's non-commercial license and 1,000-active-user / 30-day cap (measured and enforced by the gateway).
- Claiming `speak()` before NAIC eligibility is confirmed.

---

## 4. Success Criteria (Submission-Ready Demo)

By October 12:
- `chat()` and `transcribe()` (at least one ASR language) working through the published SDK against live N-ATLaS models — not mocked.
- `normalizeText()` passing tests on real Hausa/Yoruba/Igbo strings with known corruption.
- `reportIssue()` storing a real report from a starter kit and the operator able to export it.
- All three starter kits producing genuine N-ATLaS output through the SDK.
- Documentation clear enough that a judge could install the SDK and make a real call themselves.
- If `speak()` is confirmed in time: demonstrated in the Customer Service kit, clearly labelled as a rendering step after N-ATLaS's output.
- The service reachable through the judging window on a persistent host (NiHub), not the interim Colab host — see Architecture §5.
