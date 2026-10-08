# OpenAtlas API reference

There are two ways to use it: the TypeScript SDK (recommended) and the HTTP API it wraps. Both talk to the OpenAtlas gateway, never to the GPU host directly. `normalizeText()` is SDK-only: it runs locally and has no HTTP route. It repairs corrupted characters (encoding damage, look-alike letters, invisible characters, NFC; Hausa apostrophe spellings opt-in). It does **not** restore tone marks that were never typed; N-ATLaS-based tone restoration is a roadmap item only.

## HTTP API

Base URL: `https://api.getopenatlas.xyz` for the hosted service, or your own gateway URL. Auth: `Authorization: Bearer <OpenAtlas key>`. Bodies are JSON (UTF-8).

### `POST /v1/chat/completions`

| Field | Type | Required | Notes |
|---|---|---|---|
| `messages` | `{role: "system"\|"user"\|"assistant", content: string}[]` | yes | |
| `language` | `"en"\|"ha"\|"yo"\|"ig"` | no | Appends "Respond in <language>." to the system prompt, or adds one |
| `max_tokens` | number | no | Default 512, capped at 1024 |
| `temperature` | number | no | Default 0.1 |
| `user` | string | **yes** | Stable, opaque end-user ID, max 256 chars. Hashed and used only for license-cap counting |

Response `200`: `{ "content": string, "model": "NCAIR1/N-ATLaS", "attribution": "Powered by Awarri", "usage": { prompt_tokens, completion_tokens, total_tokens } }`. `usage` is present only when the backend reports it.

The gateway also sends N-ATLaS two settings that the caller doesn't control. Both come from the earlier Colab deployment, which was tested against the real weights:
- `repetition_penalty: 1.12`
- the current date (Africa/Lagos) as the chat template's `date_string`. Without it, the template tells the model "Today Date: 26 Jul 2024".

### `POST /v1/audio/transcriptions`

| Field | Type | Required | Notes |
|---|---|---|---|
| `audio` | base64 string | yes | Any format ffmpeg decodes, including the webm/m4a browsers record. About 7 MB before encoding. **30 s or less is the reliable range**: longer audio is cut into 25 s pieces, but very long free speech still loses some words |
| `language` | `"en-ng"\|"ha"\|"yo"\|"ig"` | yes | Selects the ASR model |
| `user` | string | **yes** | As above |

Response `200`: `{ "text": string, "language": string, "model": "NCAIR1/Hausa-ASR" | "NCAIR1/Yoruba-ASR" | "NCAIR1/Igbo-ASR" | "NCAIR1/NigerianAccentedEnglish", "attribution": "Powered by Awarri" }`

Models are named by their Hugging Face IDs, not renamed. `attribution` is the "Powered by Awarri" credit that N-ATLaS's terms require; show it wherever you show model output.

### `POST /v1/audio/speech` (optional; off unless `TTS_ENABLED = "true"`)

A text-to-speech renderer for text the app already has, normally N-ATLaS's reply.
- **Not N-ATLaS:** the speech models are separate. It never changes, translates or answers the text.
- **Request:** `{ text (≤1,000 chars), language: "en"|"ha"|"yo"|"ig"|"pcm", engine?: "auto"|"sorotts"|"mms", user }`.
- **Response:** `{ audio (base64 WAV), format, sample_rate, seconds, language, engine, model, voice, sentences, warnings, fallback_reason?, attribution }`.
- **Engines:** `auto` uses SoroTTS (`Shinzmann/sorotts`) for a single sentence where it covers the language and is loaded. It uses MMS-TTS for longer text, for English, or if SoroTTS fails.
  - **Why:** SoroTTS needs about 10 s per second of audio on a T4, so whole replies time out (docs/REPORT.md, KI-14).
- **Errors:**
  - `404 tts_disabled` when the gateway has it switched off;
  - `501 tts_unsupported_backend` on the RunPod backend.
- **Backend side:** `deploy/server/tts_renderer.py`.

### `POST /v1/issues`

Records a wrong N-ATLaS output with its correction (`reportIssue()` in the SDK). Only what you send here is stored.

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `"chat"\|"transcription"` | yes | |
| `output` | string | yes | What N-ATLaS returned. Max 8,000 chars |
| `correction` | string | yes | What it should have been. Max 8,000 chars |
| `input` | string | for `chat` | The prompt. Max 8,000 chars |
| `language` | `"en"\|"en-ng"\|"ha"\|"yo"\|"ig"` | no | |
| `note` | string | no | Max 2,000 chars |
| `audio` | base64 string | no | `transcription` only. Max ~1 MB once encoded |
| `user` | string | no | Hashed before storage |

Response `201`: `{ "id": string, "received_at": ISO-8601 string }`

### `GET /v1/health` (no auth)

`{ "status": "ok", "backend": { "kind": "http", "configured": bool, "host"?: string, "reachable"?: bool, "status"?: "ok"|"loading"|"error", "llm"?: bool, "asr"?: string[], "mock"?: bool } }`

With `kind: "runpod"` (fallback): `backend` is `{ kind, mock, llm_configured, asr_configured }`.

### Admin (requires `Authorization: Bearer <ADMIN_TOKEN>`)

- `POST /v1/admin/keys` with `{ "label": string, "daily_request_limit"?: number|null, "max_active_users"?: number|null }` returns `201 { id, label, key, daily_request_limit, max_active_users }`.
  - The key is shown once and stored only as a SHA-256 hash.
  - Limits that are left out get the gateway defaults (`DEFAULT_DAILY_REQUEST_LIMIT`, `DEFAULT_KEY_MAX_ACTIVE_USERS`); `null` means no limit.
- `GET /v1/admin/keys` lists every key with its limits and usage. Each entry has:
  - `requests_24h`, `requests_window`, `errors_window`, `active_users_window`;
  - `first_request_at`, `last_request_at`;
  - `routes_window`: a count per route.

  Keys themselves are never listed.
- `POST /v1/admin/keys/revoke` with `{ id, reason? }`. It takes effect on the key's next request (`401 invalid_api_key`), and the key's usage history is kept.
- `POST /v1/admin/keys/limits` with `{ id, daily_request_limit?, max_active_users? }`. Give a number, or `null` to remove the limit.
- Limits are enforced before any model call:
  - `429 key_quota_exceeded`: the key's requests in the last 24 h;
  - `429 key_user_share_reached`: a *new* end user beyond the key's share of the license cap. Existing users continue.
- `scripts/keys.mjs` wraps all of the above, plus a Markdown usage `report`.
- `GET /v1/usage` returns `{ window_days, cap, active_users, requests_in_window, by_key: [{label, user_share, active_users, requests}] }`.
- `POST /v1/key-requests` (no auth): the website's request form. `{ name, email, project, use_case, expected_users?, accept_terms: true }` returns `201 { id, status: "pending" }`; `409 request_pending` if that email already has one pending.
- `GET /v1/admin/key-requests?status=pending|approved|declined` lists requests. `POST /v1/admin/key-requests/decide` with `{ id, decision: "approve" | "decline" }`: approving issues a key (returned once, labelled with the requester's email and project). `scripts/key-requests.mjs` wraps both.
- `GET /v1/admin/issues?since=<ms>&limit=<1-500>&audio=1` exports issue reports, oldest first: `{ issues: [...], next_since }`. Without `audio=1`, each row has `has_audio` instead of the clip. Page by passing `next_since` back as `since`.

### Errors

Every error looks like `{ "error": { "code": string, "message": string, "job_id"?: string } }`.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_json`, `invalid_messages`, `invalid_language`, `invalid_audio`, `invalid_text`, `invalid_engine`, `missing_user`, `invalid_issue`, `invalid_request` | Bad request |
| 401 | `missing_api_key`, `invalid_api_key`, `invalid_admin_token` | Auth |
| 404 / 501 | `tts_disabled` / `tts_unsupported_backend` | Speech output switched off on this gateway, or not available on its backend |
| 413 | `audio_too_large`, `issue_too_large`, `text_too_long` | Over a size limit |
| 429 | `license_cap_reached` | 1,000 active end users reached; only new users are refused |
| 429 | `key_user_share_reached`, `key_quota_exceeded` | This key's share of the cap, or its daily request limit |
| 502 | `backend_error`, `upstream_error`, `upstream_failed`, `model_error`, `unexpected_upstream_shape`, `backend_auth_failed`, `backend_route_missing` | The backend or the model failed on this request. Not retried by the SDK |
| 503 | `upstream_not_configured`, `backend_unavailable` | No backend connected, or it's down or still loading models |
| 504 | `upstream_timeout` | Didn't finish within the gateway's wait (default 300 s) |

## SDK

```ts
import { OpenAtlas, OpenAtlasAPIError, OpenAtlasTimeoutError, normalizeText } from "@openatlas/sdk";

const client = new OpenAtlas({ apiKey, baseURL, timeoutMs: 300_000, maxRetries: 2 });

const { content } = await client.chat({
  messages: [{ role: "user", content: "Menene ma'anar gwagwarmaya?" }],
  language: "ha",
  user: currentUser.id,
});

const { text } = await client.transcribe({
  audio: await fs.promises.readFile("note.ogg"),
  language: "ig",
  user: currentUser.id,
});

const clean = normalizeText(scrapedText, { language: "yo" }); // local, no request

await client.reportIssue({
  kind: "transcription",
  output: text,
  correction: "Nwoke ahụ bụ agbara.",
  language: "ig",
  audio: await fs.promises.readFile("note.ogg"),
});
```

### `new OpenAtlas(options?)`

| Option | Default | |
|---|---|---|
| `apiKey` | `process.env.OPENATLAS_API_KEY` | Your OpenAtlas key |
| `baseURL` | `process.env.OPENATLAS_BASE_URL`, then the hosted gateway | Gateway URL |
| `timeoutMs` | `300000` | Per request; matches the gateway's own wait |
| `maxRetries` | `2` | Retries network errors and 503 only |
| `normalize` | `false` | Apply `normalizeText()` to chat messages, replies and transcripts automatically |

Use the SDK from server-side code. The gateway sends no CORS headers, and an API key in a browser is visible to anyone.

**Retries:** network errors and 503 are retried with backoff (1 s, 2 s, …), up to `maxRetries`. 4xx, 502 and 504 errors are never retried. A `429 license_cap_reached` won't go away by retrying.

### `user` is required on `chat`, `transcribe` and `speak`

N-ATLaS's license caps usage at 1,000 active **end users** per rolling 30 days, meaning the people interacting with N-ATLaS output through your app.
- **What to send:** a stable, opaque ID for the person your app is serving, such as a database ID or a random per-browser ID. Don't send names or emails.
- **How it's used:** the gateway hashes the ID and uses it only for this count.
- **If it's missing:** the request is refused with `400 missing_user`.

### `transcribe()` audio

- **Input:** raw bytes (`Uint8Array`/`ArrayBuffer`/`Buffer`), a `Blob`/`File` (e.g. a browser recording), or a base64 string.
- **Formats:** anything ffmpeg decodes: wav, mp3, ogg, flac, and the webm (Chrome, Firefox) and m4a (Safari) that browsers record.
- **Length:** **30 seconds or less per request is the reliable range.** Longer audio is cut into plain 25 s pieces by the backend, but on very long free speech some words are still lost (REPORT.md, KI-11).
- **Size:** about 7 MB per request; the SDK refuses larger audio before uploading. 16 kHz mono WAV, which is what the models use, is about 32 KB per second.

### `normalizeText(text, { language?, hausaApostrophes? })`

Local, no network (also available as `client.normalizeText`). It repairs:
- **Encoding damage:** UTF-8 read as Windows-1252/Latin-1 (`á»` → `ọ`, `Æ™` → `ƙ`).
- **Look-alike letters** (with `language`): Hausa `ķ`→`ƙ`, `ɖ`→`ɗ`; Yoruba and Igbo cedilla or ogonek in place of the dot below (`ş`→`ṣ`, `ę`→`ẹ`, `ǫ`→`ọ`, `į`→`ị`, `ų`→`ụ`), keeping tone marks.
- **Invisible characters** (zero-width spaces, BOM, soft hyphens), and Unicode composition (NFC).
- **Hausa apostrophe spellings** (opt-in, `hausaApostrophes: true`): `k'asa` → `ƙasa`, `d'aya` → `ɗaya`.

It does **not** add tone marks that were never typed.

### `buildPrompt(spec, input)` → `messages`

Local, no network. It builds a structured system prompt for `chat()`.
- **From OpenAtlas, the base layer:** a role line, and rules: follow the task, reply in the reply language, keep format labels in English, don't guess, be concise.
- **From your app:** `role` and `task`, plus optional `reference`, `format`, `example` and `reminder`. The reminder is repeated after the user's input.

```ts
const messages = buildPrompt({
  language: "ha",
  role: "You help a small business triage customer messages.",
  task: "Classify the message, then draft a reply that answers the customer.",
  format: "Category: one of billing, delivery, other\nDraft reply: <the reply>",
  reminder: "Reply in that format: labels in English, the draft reply in {language}.",
  inputLabel: "Customer message:",
}, transcript);
const { content } = await client.chat({ messages, user }); // no `language`: the prompt already states it
```

**Measured on the starter kits** (REPORT.md, section 18):
- **Customer Service:** the three-line format was followed 10/10, against 3/10 with the earlier free-form prompt.
- **Citizen Services:** out-of-scope questions were declined cleanly 5/6, against 1/6.
- **Education:** no measurable change.

**Cautions:**
- **Examples are copied closely,** including their language, so write an example reply in the reply language.
- **With fixed format labels, don't pass `language` to `chat()`.** The gateway's added "Respond in …" line comes last, and it made the model translate the labels.

### Errors

| Class | When |
|---|---|
| `OpenAtlasError` | Invalid arguments, thrown before any request is made |
| `OpenAtlasAPIError` | The gateway returned an error. Has `.status`, `.code` (typed as `OpenAtlasErrorCode`; the codes are in the HTTP table above) and `.jobId` |
| `OpenAtlasTimeoutError` | No response within `timeoutMs`; retry shortly |
| `OpenAtlasConnectionError` | The gateway couldn't be reached |

## Language codes

| Code | `chat()` | `transcribe()` |
|---|---|---|
| `ha` | Hausa | `NCAIR1/Hausa-ASR` |
| `yo` | Yoruba | `NCAIR1/Yoruba-ASR` |
| `ig` | Igbo | `NCAIR1/Igbo-ASR` |
| `en` | English | — |
| `en-ng` | — | `NCAIR1/NigerianAccentedEnglish` |
