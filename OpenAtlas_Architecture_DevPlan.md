# OpenAtlas — System Architecture & Development Plan

Companion document to OpenAtlas_PRD.md. This defines how OpenAtlas is built, not what it does.

---

## 1. Architecture Pattern

**Thin client, hosted-inference** — the opposite shape from Gemork's local-first design, and deliberately so: OpenAtlas's whole point is that a developer should *not* need local compute to use N-ATLaS. All model inference happens on a hosted GPU endpoint; everything a developer installs locally is a lightweight TypeScript client.

```
┌───────────────────────────────────────────────────────────┐
│                     DEVELOPER'S APPLICATION                  │
│   (citizen-services app / education app / customer-service   │
│    app / any custom app — the 3 starter kits are examples)   │
│                                                                │
│   import { OpenAtlas } from "openatlas"                      │
│   const client = new OpenAtlas({ apiKey })                   │
│   client.chat(...) / client.transcribe(...) / client.speak(..)│
└───────────────────────┬───────────────────────────────────┘
                         │  in-process call
                         ▼
┌───────────────────────────────────────────────────────────┐
│                   OPENATLAS SDK (npm package)                │
│  - Single client class, one config object                    │
│  - chat() / transcribe() / speak() (stretch)                  │
│  - Typed request/response shapes and typed errors             │
│  - Knows ONE base URL + ONE OpenAtlas key; no RunPod details  │
└───────────────────────┬───────────────────────────────────┘
                         │  HTTPS, OpenAtlas key (OpenAI-style REST)
                         ▼
┌───────────────────────────────────────────────────────────┐
│             OPENATLAS GATEWAY (Cloudflare Worker + D1)        │
│  - Verifies OpenAtlas keys (stored hashed)                    │
│  - Counts distinct active users, rolling 30 days; refuses     │
│    NEW users at the license cap (1,000)                       │
│  - Holds the RunPod key; fans out to per-endpoint RunPod URLs │
│  - Waits out cold starts (queue + poll) so the SDK doesn't    │
└───────────────────────┬───────────────────────────────────┘
                         │  HTTPS, RunPod key (never leaves the gateway)
                         ▼
┌───────────────────────────────────────────────────────────┐
│              RUNPOD SERVERLESS (hosted inference)             │
│  ┌─────────────────┐  ┌────────────────────────────────┐    │
│  │ Endpoint 1:       │  │ Endpoint 2: N-ATLaS ASR x4       │    │
│  │ N-ATLaS LLM       │  │ (one worker, 4 Whisper fine-     │    │
│  │ (Llama-3 8B, vLLM)│  │  tunes, selected by language)    │    │
│  └─────────────────┘  └────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ (Stretch) Self-hosted TTS — sorotts primary,            │    │
│  │ MMS-TTS fallback — final audio rendering only           │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────┘
```

### Why this shape
- The PRD's core value proposition is "no GPU required to use N-ATLaS." A local-first architecture (like Gemork's) would directly contradict that — so inference is centralized, and the client is deliberately thin.
- RunPod Serverless was chosen over Modal because, at the expected bursty/low-baseline traffic of a hackathon-stage developer tool, Serverless's pay-per-active-second billing is cheaper than Modal's comparable tier, and over bare Colab notebooks because Colab sessions are not persistent (idle timeout, ~12-hour hard limit, URL changes every run) — unacceptable for something judges and other developers need to reach reliably during the evaluation window.

---

## 2. Component Breakdown

| Component | Technology | Responsibility |
|---|---|---|
| **Inference host** | RunPod Serverless, two queue endpoints (scale-to-zero) | Endpoint 1 runs the N-ATLaS LLM; endpoint 2 runs all four ASR models |
| **Model serving layer** | LLM: RunPod's official vLLM worker image (no custom code). ASR: a small custom worker (`workers/asr/`, Hugging Face `transformers` Whisper pipeline), deployed via RunPod's build-from-GitHub flow | Translates RunPod jobs into actual model forward passes |
| **Gateway** | Cloudflare Worker + D1 (SQLite) | One public base URL and OpenAtlas-scoped keys for developers; active-user counting against the license cap; proxies to RunPod with the RunPod key, which never reaches the SDK or developer |
| **TTS host (stretch)** | Same RunPod account, separate endpoint | Runs `sorotts` (primary) or MMS-TTS (fallback) for final audio rendering |
| **OpenAtlas SDK** | TypeScript, published as an npm package | Single client talking to the gateway. Written fresh — there was no existing `natlas.ts` client to reuse (that earlier assumption was wrong). Seeded with the tested inference settings from the Safroi Colab *server* notebook: repetition penalty 1.12, current date passed to the chat template's `date_string`, 4-bit NF4 as the small-GPU fallback |
| **Starter kits (x3)** | Node/TypeScript (citizen services, education), Node/TypeScript with basic audio handling (customer service) | Minimal reference apps proving the SDK works end-to-end for each niche |
| **Docs** | Markdown README + inline TSDoc comments in the SDK | Quickstart + API reference |

---

## 3. API Surface

The original plan assumed RunPod could serve every model as a path under one base URL. It can't: each RunPod Serverless endpoint has its own URL and is authenticated with a RunPod account key. So there are two layers — a public, developer-facing API served by the OpenAtlas gateway, and internal RunPod calls that only the gateway makes.

### 3.1 Public API (SDK ↔ Gateway) — the only thing developers see

Base URL: the gateway's URL (one URL). Auth: `Authorization: Bearer <OpenAtlas key>`. Optional `user` field on every request: an opaque end-user ID used only for license-cap counting (hashed before storage).

```
POST /v1/chat/completions
  { messages: [{role, content}], language?: "ha"|"yo"|"ig"|"en", max_tokens?, temperature?, user? }
  → { content: string, model: "n-atlas-llm", usage: {...} }

POST /v1/audio/transcriptions
  { audio: <base64>, language: "ha"|"yo"|"ig"|"en-ng", user? }
  → { text: string, language: string, model: "n-atlas-asr-<lang>" }

GET  /v1/health        (no auth) → gateway + upstream configuration status
GET  /v1/usage         (admin)   → active users in the rolling 30-day window vs the cap
POST /v1/admin/keys    (admin)   → issue an OpenAtlas key (shown once, stored hashed)

POST /v1/audio/speech   (stretch, not built — gated on NAIC eligibility)
  { text: string, language: "ha"|"yo"|"ig"|"pcm" }
  → { audio: <base64>, model: "sorotts" | "mms-tts-<lang>" }
```

### 3.2 Internal fan-out (Gateway ↔ RunPod) — never exposed

```
chat           → POST https://api.runpod.ai/v2/{LLM_ENDPOINT_ID}/openai/v1/chat/completions
                 (vLLM worker's OpenAI-compatible route; gateway adds repetition_penalty
                  and chat_template_kwargs.date_string)
transcriptions → POST https://api.runpod.ai/v2/{ASR_ENDPOINT_ID}/run, then poll /status/{id}
                 input { audio_base64, language } — the worker picks the matching Whisper model
```

ASR is one RunPod endpoint hosting all four models, not four endpoints: four endpoints would mean four separate cold starts and four idle timers for models that each fit comfortably alongside the others on one GPU. Routing by language still happens — inside the worker instead of in the URL.

These public shapes deliberately echo OpenAI's API conventions — not because OpenAtlas wraps a general-purpose model (it doesn't; every endpoint above is served by an N-ATLaS model, except the clearly-separate stretch TTS endpoint), but because a familiar request/response shape lowers the learning curve for developers who already know this pattern from elsewhere.

---

## 4. Data Flow — Per Starter Kit

**Citizen Services:**
`user text/voice question → (optional transcribe) → chat() with civic-info context injected → N-ATLaS LLM response → displayed to user`

**Education:**
`user question in local language → chat() with instructional framing → N-ATLaS LLM response → displayed to user`

**Customer Service:**
`user voice note → transcribe() (correct ASR model by language) → chat() to classify/draft response → N-ATLaS LLM response → (stretch) speak() to render reply as audio → returned to user`

In every path, N-ATLaS (LLM and/or ASR) is the only model doing reasoning or transcription work. The stretch TTS step, when present, sits strictly after N-ATLaS's own output and touches only audio rendering of already-generated text — never reasoning, never transcription, never a substitute for N-ATLaS at any decision point.

---

## 5. Infrastructure & Deployment

- **Compute:** RunPod Serverless GPU endpoint(s) — one for LLM + ASR (can share a pod if VRAM allows; split if not), one optional for TTS.
- **Model storage:** model weights pulled from Hugging Face at container build/cold-start time, cached on the RunPod volume to minimize repeated downloads.
- **SDK distribution:** published to npm as `openatlas` (or nearest available name), source on GitHub.
- **Gateway:** Cloudflare Worker with a D1 database for hashed API keys and active-user records. Free tier is sufficient at hackathon-stage volume.
- **Secrets:** OpenAtlas keys are issued per developer by the gateway (stored as SHA-256 hashes, shown once). The RunPod API key and endpoint IDs are Worker secrets — they never reach the SDK or developers. Per-key quotas remain a roadmap item; the license-cap check is built.
- **Starter kits:** each runnable locally with `npm install && npm start`, pointed at the live hosted endpoint via an env var — no separate deployment needed for the starter kits themselves.

---

## 6. Security & Compliance Notes

- **License compliance:** N-ATLaS's license caps usage at 1,000 active users per 30 days, non-commercial. The hosted endpoint is documented and positioned explicitly as a non-commercial developer/research resource for this reason — not a production SaaS offering — and the gateway counts distinct active users over a rolling 30-day window and refuses new users at the cap, so usage against it is measured, not assumed. The count is exact for developer keys; it covers an app's end users only when the app passes the SDK's `user` field.
- **No credential storage of end-user data:** the starter kits handle demo-scale, ephemeral data only (no persistence layer is in scope for this submission).
- **Transport security:** all SDK↔endpoint traffic over HTTPS.

---

## 7. Build Sequencing (10-Day Window)

Given the constraint stated explicitly by the project owner — "we don't have 10 days to build, we have 10 days to apply" — this sequencing assumes compressed, parallel work rather than a leisurely phase-by-phase build, and treats the NAIC eligibility email as a parallel track that does not block the core path.

| Day(s) | Work | Notes |
|---|---|---|
| **Day 1** | Send NAIC eligibility clarification email (TTS pairing question). Stand up RunPod account/project, begin LLM deployment. | Email sent immediately so the answer has maximum time to arrive before the stretch component's go/no-go point. |
| **Day 2–3** | Get N-ATLaS LLM serving on RunPod Serverless end-to-end (cold start, inference, response). Write the first version of the OpenAtlas SDK's `chat()` method (fresh — no prior client exists), seeded with the Safroi Colab notebook's tested inference settings. | The notebook's settings are real prior work; the client code is not. |
| **Day 4–5** | Deploy all 4 ASR models on RunPod. Build SDK `transcribe()` method routing by language code. Begin Citizen Services and Education starter kits (both only need `chat()`). | These two starter kits can be built in parallel once `chat()` works. |
| **Day 6–7** | Build Customer Service starter kit (needs both `transcribe()` and `chat()` chained). Begin documentation (README, quickstart, API reference). | Check for NAIC email response; decide TTS go/no-go. |
| **Day 8** | **Go/no-go on TTS.** If confirmed: deploy `sorotts` (or MMS-TTS fallback) on RunPod, build SDK `speak()` method, wire into Customer Service starter kit. If not confirmed or no response: drop stretch component, reallocate time to hardening the core SDK and starter kits. | Decision point explicitly planned for, per the project owner's own conditional ("if confirmed we keep going, if not we remove it"). |
| **Day 9** | End-to-end testing of every starter kit against the live hosted endpoint (no mocks). Fix any broken paths. Finalize documentation. | This is the honesty checkpoint — nothing ships into the submission that hasn't been run for real. |
| **Day 10** | Package SDK for npm publish (or finalize as installable-from-repo if publishing isn't feasible in time). Write the submission's technical documentation and demo script. Submit. | Buffer day — if anything from Days 1–9 slipped, this is where it gets absorbed, not where new scope gets added. |

---

## 8. Dependencies & Sequencing Notes

- The LLM deployment (Day 2–3) is the single hard dependency everything else sits behind — no starter kit, no SDK method beyond `chat()`, and no demo is possible until it's live. It is first in sequence for this reason.
- ASR deployment and the Citizen Services/Education starter kits can proceed in parallel once the LLM path is proven, since they don't depend on each other.
- The TTS stretch component is deliberately placed last and gated behind an explicit go/no-go checkpoint (Day 8) rather than being built speculatively — this protects the core, must-have deliverable from being put at risk by a component whose eligibility is still unconfirmed.
- Documentation is started early (Day 6–7) rather than left to the last day, since a judge's ability to actually use the SDK themselves is part of the success criteria, not an afterthought.
