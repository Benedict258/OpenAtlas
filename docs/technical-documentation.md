# OpenAtlas: Technical Documentation

**Project:** OpenAtlas, developer infrastructure for N-ATLaS.
**Track:** NAIC 2026, Academia & Research (Developer Infrastructure).
**Team:** Team Suiaah & NiHub.
**Repository:** `github.com/Benedict258/OpenAtlas`.
**Live site:** https://getopenatlas.xyz (fallback address: https://openatlas-site.isaacbenedict001.workers.dev). **API:** https://api.getopenatlas.xyz. **Demo app:** demoapp.getopenatlas.xyz (coming soon).
**SDK:** `@openatlas/sdk` on npm.

This document describes the architecture, components, setup and usage of OpenAtlas, and how it was verified. It's written to be converted directly into the submission PDF.

**Related documents:**
- [`natlas-integration.md`](natlas-integration.md): the N-ATLaS integration in depth.
- [`deploy-your-own.md`](deploy-your-own.md): running the stack.
- [`api-reference.md`](api-reference.md): every route and SDK method.
- [`REPORT.md`](REPORT.md): every verification run, with real outputs.

---

## 1. Problem and approach

N-ATLaS is Nigeria's open language model suite: an 8B LLM for English, Hausa, Yoruba and Igbo, plus four speech recognition models, built to improve language inclusion and accessibility for Nigerians. The model exists — what's missing is the infrastructure to bridge it to real-world use by developers, businesses and institutions. In practice, that gap looks like:
- **Five separate repos:** it ships as five Hugging Face repositories with different calling conventions.
- **Hidden settings:** the LLM behaves best with specific settings (its chat template's date, a repetition penalty), which aren't obvious.
- **A GPU is required:** running the models needs a GPU most developers don't have. OpenAtlas hosts that infrastructure so they don't have to.
- **A license condition:** the cap of 1,000 active end users per 30 days has to be counted somewhere.
- **Broken text:** Nigerian-language text often arrives with corrupted special characters.

**OpenAtlas's answer** is one SDK and one hosted API. Developers call `chat()` or `transcribe()` with an API key. The infrastructure handles the model settings, the license accounting and the attribution. **OpenAtlas adds no model capability of its own: every answer and transcript comes from an N-ATLaS model.**

## 2. Architecture

```
┌─────────────┐   HTTPS + API key    ┌──────────────────────────────┐   HTTPS tunnel    ┌───────────────────────────────┐
│  Your app   │ ───────────────────▶ │  Gateway (Cloudflare Worker) │ ────────────────▶ │  GPU backend                  │
│ @openatlas/ │                      │  · key auth (hashed keys)    │   + backend key   │  natlas_server.py (FastAPI)   │
│   sdk       │ ◀─────────────────── │  · license-cap counting      │ ◀──────────────── │  · NCAIR1/N-ATLaS (bf16)      │
└─────────────┘  content/text +      │  · per-key limits            │                   │  · 4 × NCAIR1 ASR (fp16)      │
                 "Powered by Awarri" │  · attribution, error codes  │                   │  · optional speech renderer   │
                                     │  D1: keys, users, log, issues│                   │  AMD MI300X / Kaggle / Docker │
                                     └──────────────────────────────┘                   └───────────────────────────────┘
        Website (Cloudflare Worker): static pages + live starter-kit demos, calling the gateway with its own key
```

**Design choices:**
- **A thin client with centralised inference.** The point is that developers need no GPU, so the SDK is small and inference happens on one shared backend.
- **A gateway in front of a swappable host.** GPU hosts give each endpoint a URL and key, and count requests, not people. The gateway gives developers one stable URL and their own keys, counts real end users against the license, and lets the backend move with a configuration change (`deploy/set-backend.mjs`). That's how the backend moved from Colab to Kaggle to AMD with no code changes.
- **No fallback model.** If N-ATLaS can't answer, the request fails with a clear error. Nothing silently substitutes another LLM.

## 3. Components

### 3.1 SDK: `@openatlas/sdk` ([`sdk/`](../sdk/))

- **Build:** TypeScript, compiled to ES modules with type declarations. No runtime dependencies. Node 18+; tested on Node 22.
- **Distribution:** published to npm as `0.1.0`.

| Method | Purpose |
|---|---|
| `chat({ messages, user, language?, max_tokens?, temperature? })` | Text generation with `NCAIR1/N-ATLaS` |
| `transcribe({ audio, language, user })` | Speech to text with the N-ATLaS ASR model for `language` (`ha`, `yo`, `ig`, `en-ng`) |
| `speak({ text, language, engine?, user })` | Optional text to speech (separate, non-N-ATLaS models) |
| `reportIssue({ kind, output, correction, … })` | Sends a correction for a wrong output, to an exportable dataset |
| `normalizeText(text, { language })` | Local repair of corrupted characters: encoding damage, look-alike letters, invisible characters |
| `buildPrompt(spec, input)` | Local structured prompt builder; measured to improve format-following from 3/10 to 10/10 |

**Behaviour:**
- **Validation:** arguments are checked before any request, with clear `OpenAtlasError`s.
- **Errors:** gateway errors become `OpenAtlasAPIError`, with a typed `code` (`OpenAtlasErrorCode`).
- **Retries:** network errors and `503` are retried with exponential backoff (default 2 retries); 4xx, 502 and 504 are not.
- **Timeout:** 300 s by default.
- **Audio:** accepts bytes, `Blob`/`File` or base64, and is checked against the 7 MB limit before upload.
- **Required `user`:** every model call requires a stable, opaque end-user ID, for the license count.
- **Tests:** 32 unit tests (`npm test`) cover validation, retries, errors, audio encoding, normalization and the prompt builder. Publishing is gated on them (`prepublishOnly`).

### 3.2 Gateway ([`gateway/`](../gateway/))

A Cloudflare Worker (TypeScript) with a Cloudflare D1 (SQLite) database, on Cloudflare's free plan.

**Public routes (API key):**
- `POST /v1/chat/completions`
- `POST /v1/audio/transcriptions`
- `POST /v1/audio/speech`
- `POST /v1/issues`

**Other public routes:**
- `GET /v1/health` (no key);
- `POST /v1/key-requests` (the website's request form);
- `POST /v1/tester-sessions` (the website's tester form, see 3.7).

**Admin routes (admin token):**
- `GET/POST /v1/admin/keys`, `/v1/admin/keys/revoke`, `/v1/admin/keys/limits`;
- `GET /v1/admin/issues`;
- `GET/POST /v1/admin/key-requests[/decide]`;
- `GET /v1/admin/tester-sessions`, `POST /v1/admin/tester-sessions/delete`;
- `GET /v1/usage`.

**Data model** ([`gateway/schema.sql`](../gateway/schema.sql)):

| Table | Contents |
|---|---|
| `api_keys` | `id`, **SHA-256 hash** of the key (keys are shown once and never stored), label, created/revoked time, `daily_request_limit`, `max_active_users` |
| `active_users` | `subject_hash` = SHA-256(`key_id:user`), `key_id`, first/last seen. This is the license count; raw user IDs aren't stored. |
| `request_log` | time, key, route, status, latency. **No request or response content.** |
| `issue_reports` | corrections sent via `reportIssue()`: output, correction, optional input, note and audio; the user hashed |
| `key_requests` | requests from the website form, pending/approved/declined |
| `tester_sessions` | real-world validation sessions from the `/tester` form: a tester reference, never a name or contact (see 3.7) |

**Per request** (chat shown):
1. authenticate the key;
2. enforce the key's daily limit;
3. count the end user: new users are refused at the global cap of 1,000 per 30 days, or at the key's share;
4. add `Respond in <language>.` if `language` is given;
5. set the N-ATLaS inference settings (repetition penalty 1.12, today's date in the chat template, temperature 0.1, at most 1,024 new tokens);
6. forward to the backend;
7. return `{content, model: "NCAIR1/N-ATLaS", attribution: "Powered by Awarri", usage}`.

Backend failures map to stable codes: `502 backend_error` (not retried), `503 backend_unavailable` (retried), `504 upstream_timeout` (after 300 s).

**Configuration** ([`gateway/wrangler.toml`](../gateway/wrangler.toml)):

| Setting | Value |
|---|---|
| `ACTIVE_USER_CAP` / `ACTIVE_WINDOW_DAYS` | 1000 / 30 |
| `DEFAULT_DAILY_REQUEST_LIMIT` / `DEFAULT_KEY_MAX_ACTIVE_USERS` | 1000 / 100 per new key |
| `UPSTREAM_TIMEOUT_MS` | 300000 |
| `BACKEND_KIND` | `http` (`runpod` is scripted, never run) |
| `TTS_ENABLED` | `true` |
| Secrets (`wrangler secret put`) | `ADMIN_TOKEN`, `BACKEND_URL`, `BACKEND_API_KEY` (plus the RunPod values, unused) |

### 3.3 GPU backend ([`deploy/server/`](../deploy/server/))

`natlas_server.py` is one FastAPI process that loads all five N-ATLaS models (and, optionally, the speech renderer `tts_renderer.py`) and serves them over HTTP.
- **Loading:** the LLM loads in bf16 with `device_map="auto"`, and the four ASR pipelines in fp16. There's **no quantization**.
- **Readiness:** loading happens in a background thread; `GET /health` reports progress and readiness.
- **One GPU job at a time:** a single lock serialises `generate()` and ASR calls, so concurrent requests queue rather than exhaust GPU memory.
- **Audio:** ffmpeg decodes to 16 kHz mono, and audio is cut into plain 25 s pieces (measured to lose fewer words than Whisper's built-in chunking).
- **Auth:** every model route requires `Authorization: Bearer <BACKEND_API_KEY>`, compared in constant time.

| Environment variable | Meaning |
|---|---|
| `HF_TOKEN` | Hugging Face token with access to the gated NCAIR1 repos (required) |
| `BACKEND_API_KEY` | Shared secret with the gateway, 16+ characters (required) |
| `HOST`, `PORT` | Default `127.0.0.1:8000` |
| `ASR_LANGUAGES` | A subset of `ha,yo,ig,en-ng` to load (default: all) |
| `ENABLE_TTS` | `1` adds the speech renderer |

### 3.4 Hosting

| Host | Status | How |
|---|---|---|
| **AMD Instinct MI300X** (DigitalOcean AMD Developer Cloud, ROCm 7.14) | **Live host** | `node --env-file=.env deploy/amd/up.mjs <ip>`: uploads the code, runs [`deploy/amd/bootstrap.sh`](../deploy/amd/bootstrap.sh) (container setup with the ROCm PyTorch pinned, server on `127.0.0.1` plus a `cloudflared` tunnel, model load, warm-up), then reconnects the gateway. About 2.5 min on a set-up droplet. |
| **Kaggle notebook**, free T4 x2 | Proven, the free path | [`deploy/colab/natlas_kaggle.ipynb`](../deploy/colab/natlas_kaggle.ipynb): Run all. The LLM is 4-bit there, to fit the 16 GB GPUs. |
| **Docker**, any 24 GB+ NVIDIA GPU | Image built and smoke-tested in CI; not run on a GPU by us | [`deploy/server/docker-compose.yml`](../deploy/server/docker-compose.yml): backend plus tunnel |
| RunPod Serverless | Scripted, never run | [`deploy/runpod/`](../deploy/runpod/) |

**Why this shape:**
- **Built and proven on free tools first:** Kaggle's free T4 GPUs and Cloudflare's free plan, then AMD GPU droplets. Moving the backend is a gateway configuration change.
- **Anyone can reproduce it** with [`deploy-your-own.md`](deploy-your-own.md).

### 3.5 Website and starter kits ([`site/`](../site/), [`starter-kits/`](../starter-kits/))

**The website** is a Cloudflare Worker serving static pages (home, docs, starter kits, playground, architecture, key request, tester form) and an `/api/*` backend for the live demos. It calls the gateway with its own key, which never reaches the browser.

**The playground** (`/playground`, logic in [`site/src/playground.mjs`](../site/src/playground.mjs)) lets a visitor call `chat()`, `transcribe()` and `speak()` from the browser with no SDK, key or sign-up:
- **Chat:** multi-turn, with reply language, optional system prompt, `max_tokens` and `temperature`.
- **Transcribe:** a recording or uploaded file, converted in the browser to 16 kHz WAV.
- **Speak:** text in any of the five speech languages, with the engine selectable.
- **Each response** is shown exactly as the SDK returned it, next to the SDK code that makes the same call, built from the visitor's inputs.
- **Safeguards on the shared demo key:**
  - per-IP limit of 10 requests a minute;
  - the key's own daily quota and share of the license cap;
  - server-derived end-user IDs;
  - caps of 10 messages, 2,000 characters a message, 512 tokens, 30 s clips and 300 characters of speech.

**The starter kits** are three reference apps, each a `kit.mjs` (logic), a page and a small Node server. The website imports the same `kit.mjs` files, so the live demos run exactly the kits' code.

| Kit | Pipeline |
|---|---|
| Citizen Services | `normalizeText()` → `chat()` over a small labeled civic dataset, with a structured prompt that declines out-of-scope questions |
| Education | `chat()` explanation at primary or secondary level; "Report a wrong answer" → `reportIssue()` |
| Customer Service | **Voice note:** browser recording (capped at 30 s, converted to 16 kHz WAV) → `transcribe()` → `normalizeText()` → `chat()` (category, urgency, draft reply); "Correct this transcript" → `reportIssue()` with the audio. **Text chat:** a multi-turn `chat()` conversation with the support assistant of a made-up shop, grounded in its sample policies; the browser keeps the conversation and sends the last 12 messages each time. |

**Website protections:**
- **Server-derived end-user IDs:** an HMAC of the visitor's network, with at most 8 IDs per address. The browser can't inflate the license count.
- **Per-IP request limit.**
- **A backend-status banner:** online, starting or offline.

### 3.6 Speech output (optional, not N-ATLaS)

`speak()` renders N-ATLaS's text as audio, with SoroTTS (`Shinzmann/sorotts`) for single sentences in Hausa, Yoruba, Igbo and Pidgin, and Meta MMS-TTS for longer text and English.
- **What it doesn't do:** it never changes, translates or answers the text.
- **Accuracy,** heard back through the N-ATLaS ASR models: English 0–3% of words wrong; Hausa, Yoruba and Igbo 18–81%. So the public site doesn't use it, and the demo shows English only.

### 3.7 Real-world validation log

Testers log each session at `/tester` (link: `/tester?ref=T01`). The fields:
- **Who:** a tester reference given by the operator (no name or contact field exists) and tester type.
- **What:** the features tested (SDK methods, playground, each kit, key request, self-hosting) and the languages used.
- **How it went:** outcome (worked, partly, failed) and minutes to the first successful call.
- **Ratings, 1–5:** setup, output quality, docs.
- **Problems:** issues with their severity, plus an optional `reportIssue()` id.
- **Comments:** free feedback, and the label of the API key used (never the key).
- **Consent:**
  - to store the answers (required; without it nothing is saved);
  - to quote them (named, anonymous, or no).

The operator keeps the reference-to-person mapping outside the system. `scripts/testers.mjs` lists, summarizes (Markdown, with quotable feedback only where consent was given), exports CSV, and deletes every session for a reference when a tester withdraws.

## 4. Security and privacy

| Concern | Handling |
|---|---|
| API keys | Stored only as SHA-256 hashes, shown once at issue. Revocable, with immediate effect. |
| End-user data | Only `sha256(keyId:user)` is stored, for the license count. Request and response content isn't logged. Corrections are stored only when an app calls `reportIssue()`. |
| Backend credential | The backend's key lives in the gateway (Worker secret). Developers never see it. |
| GPU host exposure | The server binds `127.0.0.1` inside its container, and the tunnel is the only way in. Checked from outside: the droplet's port 8000 doesn't answer. |
| Secrets in transit to the host | Passed over SSH as environment variables, never written to the droplet's disk or a command line. |
| Abuse | Per-key daily limits and per-key user shares; website per-IP limits; server-derived website user IDs; playground input caps (3.5); at most 200 tester sessions an hour. |
| Tester data | No names or contact details are collected; consent is required to store and asked separately for quoting; deletion by tester reference. |
| Browser use | The gateway sends no CORS headers: keys belong on servers, as the starter kits do it. |

## 5. Setup

**Using the hosted API:**
1. Request a key on the website.
2. `npm install @openatlas/sdk`.
3. Set `OPENATLAS_API_KEY`.
4. Call `chat()` (see section 6).

**Running the whole stack:** follow [`deploy-your-own.md`](deploy-your-own.md). In outline:
1. Accept the N-ATLaS terms on Hugging Face and create a read token.
2. Set up the gateway on Cloudflare: `deploy/setup-gateway.mjs` in one command, or the documented manual steps.
3. Start a backend: AMD (`deploy/amd/up.mjs`), Kaggle (the notebook) or Docker (`docker compose up`).
4. Connect it with `deploy/set-backend.mjs <url>`.
5. Check it with `sdk/examples/quickstart.mjs` and `scripts/smoke-gateway.mjs`.

**Local development** (no GPU; mock backend):
```bash
npm install && npm run build && npm test          # SDK build + 32 tests
npm run dev:mock-backend                          # mock backend on :8788 (every output marked "[MOCK — not N-ATLaS output]")
cp gateway/.dev.vars.example gateway/.dev.vars && npm run db:init:local -w openatlas-gateway && npm run dev:gateway   # :8787
cp site/.dev.vars.example site/.dev.vars && npm run dev:site                                                         # :8790
```

## 6. Usage

**SDK:**
```ts
import { OpenAtlas } from "@openatlas/sdk";
import { readFile } from "node:fs/promises";

const client = new OpenAtlas(); // OPENATLAS_API_KEY from the environment
const user = "user-123";       // stable, opaque end-user ID

const { content, attribution } = await client.chat({
  messages: [{ role: "user", content: "Me ake nufi da kalmar 'gwagwarmaya'?" }], language: "ha", user,
});
const { text, model } = await client.transcribe({ audio: await readFile("note.wav"), language: "yo", user });
const { audio } = await client.speak({ text: "Your order will arrive tomorrow.", language: "en", user });
```

**HTTP:**
```bash
curl -s https://api.getopenatlas.xyz/v1/chat/completions \
  -H "Authorization: Bearer $OPENATLAS_API_KEY" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Kedu?"}],"language":"ig","user":"user-123"}'
# {"content":"…","model":"NCAIR1/N-ATLaS","attribution":"Powered by Awarri","usage":{…}}
```

**Operations** (repo root, with an admin token in `.env`):

| Task | Command |
|---|---|
| List keys with usage | `node --env-file=.env scripts/keys.mjs` |
| Issue, limit, revoke | `scripts/keys.mjs issue <label> [--daily N] [--users N]`, `limits <id> …`, `revoke <id> [reason]` |
| Review key requests | `node --env-file=.env scripts/key-requests.mjs` |
| Usage report (Markdown) | `scripts/keys.mjs report` |
| Point the gateway at a backend | `node --env-file=.env deploy/set-backend.mjs <tunnel-url>` |
| Export corrections | `GET /v1/admin/issues?since=<ms>&audio=1` |
| Tester sessions | `node --env-file=.env scripts/testers.mjs` (`summary`, `csv`, `delete <ref>`) |

## 7. Verification

| Layer | How it's checked |
|---|---|
| SDK | 32 unit tests, required before publishing; a clean `npm install @openatlas/sdk` in an empty folder returned a real N-ATLaS answer (REPORT.md section 24) |
| Gateway | Type-checked. Live checks of every error path, auth, limits, revocation and license counting. |
| Backend images | CI builds the Docker image and smoke-tests it: it starts, `/health` answers, and requests are refused without the key (401) and before loading (503). |
| End to end | Scripted live runs through the public gateway, logged in `REPORT.md`: chat in four languages, transcription with WER on real recordings, speech heard back by ASR, concurrency, the three starter kits through the website |

**Results on the live AMD MI300X backend** (REPORT.md sections 28–29):

| Measure | Result |
|---|---|
| Server GPU memory (`amd-smi`) | 25.3 GB; GPU activity 0% idle → 100% while generating |
| Chat, 34–60 tokens | 0.5–0.9 s GPU time; 1.5–3.0 s through the public gateway |
| Transcription, 26.7 s of Hausa | 0.64 s GPU time |
| Starter kits via the website | Citizen Services 3.5 s, Education 3.0 s, Customer Service 11.2 s (including the audio upload); Customer Service text chat 1.3–3.9 s a reply |
| Playground via the website | chat 3.8 s, transcribe 4.0 s, speak 5.7 s; checked in a real browser at desktop and phone width |
| ASR WER, smoke clips | Hausa 26%, Yoruba 74%, Igbo 0%, Nigerian English 0% |
| Speech, heard back | English 0–3% WER |
| Keys and limits | 401 (no key, wrong key, revoked key), 429 (daily limit, user share) as designed |
| Startup | 4 min 49 s from command to serving on a freshly created droplet, models included (REPORT.md section 32); about 2.5 min on a set-up droplet |

## 8. Limitations

- **Model quality:**
  - Yoruba is the weakest language (repetition loops in about 1 of 11 runs, missing tone marks);
  - instruction following is loose;
  - factual slips occur.
- **Customer Service text chat:** N-ATLaS sometimes states things the shop's policies don't say. Hausa sometimes claims to be looking up an order; Yoruba has said "7 weeks" for 7 days. Measured in REPORT.md section 31.
- **License cap:** the 1,000-user cap is shared across the hosted service.
- **Not yet tested:** the Docker image on a GPU; RunPod.
- **Not yet routed back:** corrections collected with `reportIssue()` have no agreed channel to the N-ATLaS maintainers yet.

All of these are measured, with details in the Known issues table of [`REPORT.md`](REPORT.md).

## 9. Repository layout

| Folder | Contents |
|---|---|
| `sdk/` | The npm package: source, tests, examples |
| `gateway/` | The Cloudflare Worker and D1 schema |
| `deploy/` | The GPU backend server, AMD bootstrap, Kaggle and Colab notebooks, Docker, RunPod, `set-backend.mjs`, `setup-gateway.mjs` |
| `starter-kits/` | The three reference apps |
| `site/` | The website and its demo API |
| `scripts/` | Key management, live verification scripts, evaluations, the evidence packager, dev tools (mock backend) |
| `docs/` | This document, the integration write-up, the API reference, the deploy guide, the verification record, planning documents |
| `.github/` | CI for the backend and RunPod images |
