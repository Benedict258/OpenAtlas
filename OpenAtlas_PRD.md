# OpenAtlas — Product Requirements Document

**Track:** National AI Innovation Challenge (NAIC) 2026 — Academia & Research, Developer Infrastructure problem statement
**Submission deadline:** October 12, 2026, 11:59 PM WAT
**Build window:** ~10 days (shared with the BUILD Conference Oct 7 deadline for a separate project)

---

## 0. Build Approach Note

OpenAtlas is not an application built on top of N-ATLaS — it is the infrastructure layer that makes building applications on top of N-ATLaS fast. The deliverable the judges evaluate is the SDK, the hosted endpoint, and the starter kits that prove both work end to end. Everything in this document is scoped to what is realistically demonstrable inside the stated build window, per the honesty standard applied across every other submission this cycle: no feature is described as working unless it will actually be running by submission time.

---

## 1. Overview

### 1.1 Core Value Proposition
OpenAtlas makes N-ATLaS — Nigeria's sovereign LLM and four-language ASR model family — usable by any developer in minutes instead of days, by providing (a) a persistent hosted deployment so no one needs their own GPU, and (b) a single TypeScript SDK so no one has to learn five separate model interfaces.

### 1.2 Primary Target Users
- **Nigerian/West African developers** building citizen-facing, educational, or customer-service tools who want local-language AI without standing up their own ML infrastructure.
- **Academic/research teams** (this submission's own track) who want a reliable, documented way to build on N-ATLaS for coursework, research prototypes, or civic-tech projects.
- **NAIC judges**, evaluating whether this submission genuinely integrates N-ATLaS as the reasoning/transcription engine, per the challenge's explicit disqualification rule against wrapping a general-purpose model.

### 1.3 Essential Components

| Component | What it is | Priority |
|---|---|---|
| **Hosted N-ATLaS deployment** | Persistent RunPod Serverless endpoint serving the N-ATLaS LLM and all four ASR models behind a stable URL | Must-have |
| **OpenAtlas SDK (TypeScript/Node)** | Single npm package wrapping chat/completions (LLM) and transcription (4x ASR) in one client | Must-have |
| **Starter kit — Citizen Services** | Minimal reference app: local-language Q&A over a small civic-info corpus | Must-have |
| **Starter kit — Education** | Minimal reference app: local-language tutoring/explanation flow | Must-have |
| **Starter kit — Customer Service** | Minimal reference app: local-language support-ticket triage/response | Must-have |
| **Voice middleware (ASR → LLM → TTS)** | Optional pipeline chaining N-ATLaS ASR, N-ATLaS LLM, and a self-hosted TTS renderer for spoken output | Stretch — contingent on NAIC eligibility clarification |
| **Documentation site/README** | Quickstart, API reference, architecture explanation | Must-have |

### 1.4 Core Workflow (Primary Developer Journey)
1. Developer installs the OpenAtlas SDK (`npm install openatlas`).
2. Developer initializes the client with an OpenAtlas API key, issued by the OpenAtlas gateway (which proxies to the hosted RunPod endpoints — no local model, no GPU, and no RunPod credentials on the developer's side).
3. Developer calls `openatlas.chat()` for text reasoning in English or a local language, or `openatlas.transcribe()` with a language code (`ha`, `yo`, `ig`, `en-ng`) for speech-to-text.
4. Developer optionally clones a starter kit matching their niche (citizen services / education / customer service) and swaps in their own content/corpus.
5. (Stretch) Developer calls `openatlas.speak()` to render a final response as audio via the self-hosted TTS step, after N-ATLaS has done the actual reasoning or transcription.

---

## 2. Feature Deep-Dives

### 2.1 Hosted N-ATLaS Deployment
- **Hosting:** RunPod Serverless, chosen over Modal/Colab for lower cost at the expected low/bursty request volume of a hackathon-stage service, and because Serverless billing (pay only while a request is being served) fits a project with no guaranteed baseline traffic.
- **What's served:** the N-ATLaS LLM (Llama-3 8B fine-tune, quantized as needed to fit the chosen GPU tier) and all four ASR models (Hausa, Yoruba, Igbo, Nigerian-accented English), each reachable as a distinct endpoint path behind one base URL. RunPod itself does not provide this: every RunPod Serverless endpoint has its own URL (`api.runpod.ai/v2/{endpoint_id}/...`) authenticated with a RunPod account key. The single base URL is therefore provided by a thin OpenAtlas gateway (Cloudflare Worker) that holds the RunPod keys and fans requests out to the right endpoint — see Architecture §3.
- **Honest scope:** this is new infrastructure stood up for this submission. It has not been load-tested, and no uptime/SLA claim is made. Cold-start latency on Serverless is expected and will be documented, not hidden.
- **License constraint carried forward explicitly:** N-ATLaS's license caps usage at 1,000 active users per 30 days and is non-commercial. The hosted endpoint is built and documented as a non-commercial developer/research resource, consistent with that cap — not positioned as a production SaaS offering. The gateway counts distinct active users over a rolling 30-day window and refuses requests from *new* users once the cap is reached, so compliance is measured rather than assumed. Limit of that measurement: the gateway sees developer keys directly, but it can only count an app's *end* users if the app passes an end-user identifier (the SDK's `user` field); requests without one are counted per developer key.

### 2.2 OpenAtlas SDK (TypeScript/Node)
- **Why TypeScript/Node:** it matches the stack of the starter kits and the gateway, and it is the language most of the target developers already ship web backends in. The SDK client is written fresh for this submission — there is no pre-existing N-ATLaS client to adapt (an earlier assumption that a tested `natlas.ts` client existed from the Safroi integration turned out to be wrong; the only prior N-ATLaS code is a Colab *server* notebook, and Safroi's TypeScript layer called a different provider). What *is* carried over from that notebook, which was run against the real N-ATLaS weights, is its tested inference settings: repetition penalty 1.12, passing the current date into the chat template's `date_string` (the template otherwise silently uses "26 Jul 2024"), and the 4-bit NF4 quantization config as the fallback for smaller GPUs. A Python port is explicitly out of scope for this submission (stretch-only, noted as a roadmap item).
- **Surface area (minimum viable):**
  - `openatlas.chat({ messages, user, language? })` → LLM completion, OpenAI-compatible-style request/response shape for familiarity.
  - `openatlas.transcribe({ audio, language, user })` → routes to the correct one of the four ASR models by language code.
  - `openatlas.speak({ text, language })` → (stretch) routes to the self-hosted TTS renderer.
- **Design principle:** one consistent interface regardless of which underlying N-ATLaS model is actually called — the SDK's job is to make N-ATLaS's five separate models (1 LLM + 4 ASR) feel like one coherent API surface.
- **Distribution:** published as an installable npm package with a README quickstart, not just source code in a repo.

### 2.3 Starter Kits
Three minimal, runnable reference implementations — not full products — each demonstrating a complete request path through the SDK to the hosted endpoint and back:

| Starter Kit | Demonstrates |
|---|---|
| **Citizen Services** | A local-language Q&A flow over a small, hardcoded civic-info dataset (e.g., "how do I renew my ID") — shows `chat()` with language-aware prompting |
| **Education** | A tutoring-style explanation flow (e.g., "explain this concept in Yoruba at a secondary-school level") — shows `chat()` with instructional framing |
| **Customer Service** | A support-ticket intake flow that accepts a short voice note, transcribes it, and classifies/drafts a response — shows `transcribe()` + `chat()` chained together |

Each starter kit ships as a small standalone script or minimal web page, with its own short README explaining what it proves and what it deliberately does not attempt (no persistence layer, no auth, no real dataset beyond a demo fixture).

### 2.4 Voice Middleware (Stretch, Conditional)
- **Pipeline:** N-ATLaS ASR (speech in) → N-ATLaS LLM (reasoning) → self-hosted TTS (speech out).
- **TTS candidates, in priority order:**
  1. `Shinzmann/sorotts` (Hugging Face) — Orpheus-architecture model fine-tuned with LoRA/Unsloth, with stated coverage of Yoruba, Hausa, Igbo, and Nigerian Pidgin — the closest fit to N-ATLaS's own language set.
  2. Meta MMS-TTS (`facebook/mms-tts-yor` / `-hau` / `-ibo`) as a fallback if `sorotts` proves unreliable or too heavy to self-host in the time available.
- **Explicit boundary:** TTS is a final-stage audio rendering step only. It never performs reasoning, transcription, or any task N-ATLaS is meant to do — N-ATLaS remains the genuine engine throughout. This distinction is documented plainly in the submission so it cannot be mistaken for "wrapping a general-purpose model."
- **Go/no-go gate:** this component proceeds only if NAIC's secretariat confirms (via direct eligibility-clarification email) that this pairing does not violate the rule against wrapping a general-purpose model in place of N-ATLaS. If no confirmation arrives in time, or if the answer is negative, this component is dropped from the submission without weakening the core SDK/hosting/starter-kits deliverable.

---

## 3. Explicit Non-Goals (For This Submission)

- Production-grade uptime, scaling, or multi-tenant load handling.
- A Python (or any non-TypeScript) SDK — roadmap item only.
- Full, deployment-ready applications in any of the three niches — these are reference starter kits, not products.
- Fine-tuning or retraining any N-ATLaS model.
- Any commercial usage positioning, given the model's non-commercial license cap.
- Claiming TTS as a core, guaranteed feature before NAIC eligibility is confirmed.

---

## 4. Success Criteria (Submission-Ready Demo)

At minimum, by October 12:
- A live, reachable hosted endpoint serving at least the N-ATLaS LLM and at least one ASR language end to end.
- A published (or at minimum installable-from-repo) OpenAtlas SDK with working `chat()` and `transcribe()` methods, demonstrated against the live endpoint — not mocked.
- All three starter kits running against the real SDK and real hosted endpoint, each producing a genuine N-ATLaS response (not a stub).
- Documentation clear enough that a judge could install the SDK and make a real call themselves.
- If the TTS pairing is confirmed in time: a working `speak()` call demonstrated in at least the Customer Service starter kit, clearly labeled as a final rendering step after N-ATLaS's own output.
