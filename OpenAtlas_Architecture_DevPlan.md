# OpenAtlas — System Architecture & Development Plan

Companion document to OpenAtlas_PRD.md. This defines how OpenAtlas is built, not what it offers. The product is the SDK's capability surface (`chat`, `transcribe`, `normalizeText`, `reportIssue`, stretch `speak`); hosting is the implementation detail described here.

---

## 1. Architecture Pattern

**Thin client → gateway → swappable GPU backend.** A developer installs only a lightweight TypeScript client. All inference happens on a GPU host behind an OpenAtlas gateway. The gateway is the only public URL; the GPU host can change without any change to the SDK or to developers' code.

```
┌──────────────────────────────────────────────────────────────┐
│                    DEVELOPER'S APPLICATION                    │
│  (the 3 starter kits, or any custom app)                      │
│  import { OpenAtlas, normalizeText } from "openatlas"          │
└──────────────────────────┬───────────────────────────────────┘
                           │ in-process
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  OPENATLAS SDK (npm: openatlas)               │
│  chat() / transcribe() / reportIssue()  → network calls        │
│  normalizeText()                        → local, no network    │
│  speak() (stretch)                                             │
│  Knows ONE gateway URL + ONE OpenAtlas key. Nothing about GPUs.│
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS, Authorization: Bearer <OpenAtlas key>
                           ▼
┌──────────────────────────────────────────────────────────────┐
│            OPENATLAS GATEWAY (Cloudflare Worker + D1)         │
│  - Issues and verifies OpenAtlas-scoped keys (stored hashed)   │
│  - Counts distinct end users, rolling 30 days; refuses NEW     │
│    users at the N-ATLaS license cap (1,000)                    │
│  - Stores reportIssue() submissions (same D1 database)         │
│  - Proxies to the backend named by config (BACKEND_KIND/URL)   │
│  - Holds the backend credential; it never reaches developers   │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS, backend credential
                           ▼
┌──────────────────────────────────────────────────────────────┐
│     GPU BACKEND — any host implementing the backend contract  │
│                                                                │
│  NOW:      Google Colab (interim dev/test only, T4, tunnel)    │
│  INTENDED: NiHub persistent GPU (same server, persistent URL)  │
│  FALLBACK: RunPod Serverless (vLLM worker + ASR worker)        │
│                                                                │
│  Serves: N-ATLaS LLM (Llama-3 8B fine-tune)                     │
│          4 × N-ATLaS ASR (Whisper-small fine-tunes: ha/yo/ig/en-ng)│
│          (stretch) TTS — final audio rendering only            │
└──────────────────────────────────────────────────────────────┘
```

### Why a gateway
RunPod (and most GPU hosts) gives each endpoint its own URL and its own key; there is no single OpenAtlas base URL out of the box, and handing host credentials to developers would expose the account. A flat pass-through also could not enforce the N-ATLaS license: the cap is on **unique end users** (1,000 per rolling 30 days), while hosts like RunPod count only requests. The gateway therefore:
1. issues OpenAtlas-scoped keys to developers,
2. authenticates every request and proxies it to the real backend with a credential only the gateway holds,
3. records a hashed (key, end-user) pair per request and refuses *new* users once the active count reaches the cap.

### Why the backend is swappable
Hosting is in flux during the build (see §5): Colab today, NiHub expected imminently, RunPod as fallback. The gateway reads the backend from configuration — `BACKEND_KIND` (`http` or `runpod`) plus `BACKEND_URL`/`BACKEND_API_KEY` (or RunPod endpoint IDs) — stored as Worker secrets. Moving hosts is `wrangler secret put` (scripted in `deploy/set-backend.mjs`), not a code change or redeploy.

---

## 2. Component Breakdown

| Component | Technology | Responsibility |
|---|---|---|
| **OpenAtlas SDK** | TypeScript, npm package `openatlas` | Single client talking to the gateway; `normalizeText()` runs locally. Written fresh — there was never a `natlas.ts` client to reuse (that earlier assumption was wrong). Seeded with the tested settings from the Safroi Colab server notebook: repetition penalty 1.12, current date into the chat template's `date_string`, 4-bit NF4 quantization |
| **Gateway** | Cloudflare Worker + D1 (SQLite) | Keys, license-cap accounting, issue reports, proxying to the configured backend |
| **Backend server (`http` kind)** | Python, FastAPI + `transformers` (`deploy/server/natlas_server.py`) | Implements the backend contract (§3.2). The same file runs on Colab and on NiHub |
| **Backend (`runpod` kind, fallback)** | RunPod's vLLM worker image (LLM) + `workers/asr/` (ASR) | Same contract semantics via RunPod's job API |
| **TTS (stretch)** | sorotts / MMS-TTS on the same backend | Final audio rendering only; gated on NAIC eligibility |
| **Starter kits (x3)** | Node; `kit.mjs` (logic) + `public/` (page from the design) each | Reference apps exercising the full SDK |
| **Website** | Cloudflare Worker + static assets (`site/`), from the Claude Design file | Product, Docs, Starter kits (the three kits running live, same `kit.mjs`), Architecture, and the API key request form. Holds its own OpenAtlas key (`website-demos`); reaches the gateway through a Service Binding (Worker-to-Worker fetches over workers.dev are blocked) |
| **Docs** | README, `docs/api-reference.md`, TSDoc | Quickstart and API reference |

---

## 3. API Surface

### 3.1 SDK surface (what developers call)

| Method | Network? | Gateway route |
|---|---|---|
| `chat({ messages, user, language?, max_tokens?, temperature? })` → `{ content, model, usage }` | yes | `POST /v1/chat/completions` |
| `transcribe({ audio, language, user })` → `{ text, language, model }` | yes | `POST /v1/audio/transcriptions` |
| `normalizeText(text, { language?, hausaApostrophes? })` → `string` — character repair only; does **not** restore tone marks that were never typed (N-ATLaS-based restoration: roadmap only) | **no** — local | — |
| `reportIssue({ kind, input, output, correction, language?, note?, audio?, user? })` → `{ id, received_at }` | yes | `POST /v1/issues` |
| `speak({ text, language })` *(stretch, not built)* | yes | `POST /v1/audio/speech` |

Client options: `apiKey`, `baseURL`, `timeoutMs`, `maxRetries`, `normalize` (apply `normalizeText()` to chat inputs/outputs and transcripts automatically).

### 3.2 Public gateway API (SDK ↔ gateway)

One base URL (the gateway). Auth: `Authorization: Bearer <OpenAtlas key>`. `user` (opaque end-user ID, hashed before storage) is required on `chat` and `transcribe` so the license cap counts real end users.

```
POST /v1/chat/completions
  { messages: [{role, content}], language?: "en"|"ha"|"yo"|"ig", max_tokens?, temperature?, user }
  → { content, model: "NCAIR1/N-ATLaS", attribution: "Powered by Awarri", usage }

POST /v1/audio/transcriptions
  { audio: <base64>, language: "ha"|"yo"|"ig"|"en-ng", user }
  → { text, language, model: "NCAIR1/<Hausa|Yoruba|Igbo>-ASR" | "NCAIR1/NigerianAccentedEnglish", attribution: "Powered by Awarri" }

POST /v1/issues
  { kind: "chat"|"transcription", input, output, correction, language?, note?, audio?, user? }
  → 201 { id, received_at }

GET  /v1/health          (no auth)  gateway status, backend kind, backend reachability
GET  /v1/usage           (admin)    active users in window vs cap
POST /v1/admin/keys      (admin)    issue an OpenAtlas key (shown once, stored hashed)
GET  /v1/admin/issues    (admin)    export issue reports (?since=<ms>&limit=)
POST /v1/key-requests     (no auth)  website form: { name, email, project, use_case, expected_users?, accept_terms }
GET  /v1/admin/key-requests          (admin) list requests (?status=pending|approved|declined)
POST /v1/admin/key-requests/decide   (admin) { id, decision: approve|decline }; approve issues a key, shown once

POST /v1/audio/speech    (stretch, not built)
```

### 3.3 Backend contract (gateway ↔ GPU host) — never exposed to developers

Any host that serves these routes can be the backend (`BACKEND_KIND=http`). Auth: `Authorization: Bearer <BACKEND_API_KEY>`.

```
GET  /health
  → { status: "ok", llm: bool, asr: ["ha","yo","ig","en-ng"] }

POST /v1/chat/completions          (OpenAI-compatible)
  { messages, max_tokens, temperature, repetition_penalty, chat_template_kwargs: { date_string } }
  → { choices: [{ message: { content } }], usage }     (a plain { content } body is also accepted)

POST /v1/audio/transcriptions      multipart/form-data: audio (file), language
  → { text, language, model, inference_ms }
```

`deploy/server/natlas_server.py` implements this contract. The Colab notebook (`deploy/colab/openatlas_colab.ipynb`) is generated from the same file, so what is tested on Colab is exactly what will run on NiHub.

For `BACKEND_KIND=runpod` (fallback), the gateway maps the same requests onto RunPod's job API: chat → the vLLM worker's OpenAI route (`/v2/{LLM_ENDPOINT_ID}/runsync` with `openai_route`), transcription → `/v2/{ASR_ENDPOINT_ID}/runsync` then `/status/{id}` polling.

ASR is one backend process hosting all four models, routed by `language` inside the server: four Whisper-small models (~0.5 GB each in fp16) fit alongside the 4-bit LLM (~5.7 GB) on a single 15 GB T4.

---

## 4. Data Flow — Per Starter Kit

**Citizen Services:** question → `normalizeText()` → `chat()` with demo civic context → N-ATLaS answer → shown.

**Education:** question + level → `chat()` with instructional framing → explanation → (if wrong) `reportIssue()` with the user's correction.

**Customer Service:** voice note → `transcribe()` (ASR model chosen by language) → `normalizeText()` → `chat()` to classify and draft → shown with the transcript → (if transcript wrong) `reportIssue()` with corrected text and the audio → (stretch) `speak()`.

N-ATLaS is the only model doing reasoning or transcription in every path. `normalizeText()` is deterministic text processing. The stretch TTS step only renders already-generated text.

---

## 5. Infrastructure & Hosting

### 5.1 Hosting plan

| Host | Role | Status (2026-10-02) |
|---|---|---|
| **Google Colab** (free T4 + Cloudflare quick tunnel) | **Interim dev/testing host only.** Lets the gateway and SDK be built and verified against real N-ATLaS today | Notebook written; must be run from the owner's Google account. **Not persistent:** idle disconnects, ~12 h session limit, and the tunnel URL changes every run, so the gateway's `BACKEND_URL` must be updated after each restart |
| **NiHub** (persistent GPU, offered by NiHub) | **Intended host** for anything that must stay up through submission and judging | Servers expected ~2026-10-03; not yet confirmed live. Migration = run `natlas_server.py` there, then `deploy/set-backend.mjs <url> <key>` |
| **RunPod Serverless** | Fallback if NiHub falls through | Scripts exist (`deploy/llm`, `deploy/asr`, `deploy/go-live-llm.sh`); **not deployed** — account unfunded; no spend until the owner says so |

Colab is never the submission deployment. Any demo or judging-window URL must point at the persistent host.

### 5.2 Other infrastructure
- **Model weights:** pulled from Hugging Face on backend start (HF token with access to all five N-ATLaS repos — verified 2026-10-02).
- **Gateway:** Cloudflare Worker + one D1 database holding hashed keys, active-user records, a minimal request log (no content), and issue reports. Free tier is sufficient at this volume.
- **Secrets:** OpenAtlas keys issued per developer (SHA-256 hashes stored). Backend URL/credential are Worker secrets and never reach the SDK.
- **SDK distribution:** npm as `openatlas` (or installable from the repo if publishing slips).
- **Starter kits:** `npm install && npm start`, pointed at the gateway via env vars.

---

## 6. Security & Compliance Notes

- **License compliance:** non-commercial; 1,000 active end users per rolling 30 days. The gateway measures this per hashed (key, `user`) pair and refuses new users at the cap. Known limitation: two brand-new users arriving simultaneously at exactly the cap can both be admitted (non-atomic check-then-insert).
- **Attribution:** "N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies." shown in docs and starter kits.
- **Data minimisation:** `chat()`/`transcribe()` content is never stored. Only `reportIssue()` submissions — explicitly sent by an app — are kept; end-user IDs are hashed.
- **Transport:** HTTPS for SDK↔gateway and gateway↔backend (Colab via Cloudflare tunnel; NiHub endpoint must be HTTPS or tunnelled).

---

## 7. Build Sequencing (revised 2026-10-02, 10 days to deadline)

| When | Work | Notes |
|---|---|---|
| **Oct 2** | Docs updated to the Developer Tooling framing. Backend server + Colab notebook. Gateway made host-agnostic; `/v1/issues`. SDK `normalizeText()`, `reportIssue()`. | Gateway logic verified locally against a labelled stub backend until Colab is up |
| **Oct 2–3** | Owner runs the Colab notebook → `set-backend.mjs` → real `chat()`/`transcribe()` through the public gateway | First real end-to-end verification |
| **Oct 3–4** | NiHub live → same server there → swap backend config → re-verify everything | Explicitly reported to the owner when hosting moves off Colab |
| **Oct 4–7** | Starter kits finished against the real SDK (all methods); docs | Check NAIC eligibility reply; TTS go/no-go by Oct 7 |
| **Oct 8–9** | If TTS confirmed: `speak()`. Otherwise harden core. Full end-to-end run of every kit on the persistent host | Honesty checkpoint — nothing ships un-run |
| **Oct 10–11** | npm publish, submission write-up, demo script | Buffer |
| **Oct 12** | Submit | |

---

## 8. Dependencies & Risks

- **A real backend is the hard dependency.** Until Colab is running, `chat()`/`transcribe()` can only be verified against stubs, which do not count as done.
- **Colab is fragile by design** (idle timeout, 12 h limit, changing URL). Any session loss is reported plainly, not papered over.
- **NiHub timing is external.** If it slips past Oct 4, decide between RunPod (requires funding) and demoing on Colab with its limits disclosed.
- **TTS** is gated and placed last so it cannot put the core at risk.
