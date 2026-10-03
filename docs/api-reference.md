# OpenAtlas API reference

There are two ways to use it: the TypeScript SDK (recommended) and the HTTP API it wraps. Both talk to the OpenAtlas gateway, never to the GPU host directly. `normalizeText()` is SDK-only: it runs locally and has no HTTP route. It repairs corrupted characters (encoding damage, look-alike letters, invisible characters, NFC; Hausa apostrophe spellings opt-in). It does **not** restore tone marks that were never typed; N-ATLaS-based tone restoration is a roadmap item only.

## HTTP API

Base URL: the gateway URL. Auth: `Authorization: Bearer <OpenAtlas key>`. Bodies are JSON (UTF-8).

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
| `audio` | base64 string | yes | wav, flac, ogg or mp3 on any backend; webm/m4a only on an ffmpeg backend (not the current Colab notebook). About 7 MB before encoding. **Keep to 30 s of audio or less**: longer audio is accepted but currently loses words |
| `language` | `"en-ng"\|"ha"\|"yo"\|"ig"` | yes | Selects the ASR model |
| `user` | string | **yes** | As above |

Response `200`: `{ "text": string, "language": string, "model": "NCAIR1/Hausa-ASR" | "NCAIR1/Yoruba-ASR" | "NCAIR1/Igbo-ASR" | "NCAIR1/NigerianAccentedEnglish", "attribution": "Powered by Awarri" }`

Models are named by their Hugging Face IDs, not renamed. `attribution` is the "Powered by Awarri" credit that N-ATLaS's terms require; show it wherever you show model output.

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

- `POST /v1/admin/keys` with `{ "label": string }` returns `201 { id, label, key }`. The key is shown once and stored only as a SHA-256 hash.
- `GET /v1/usage` returns `{ window_days, cap, active_users, requests_in_window, by_key: [{label, active_users}] }`.
- `POST /v1/key-requests` (no auth): the website's request form. `{ name, email, project, use_case, expected_users?, accept_terms: true }` returns `201 { id, status: "pending" }`; `409 request_pending` if that email already has one pending.
- `GET /v1/admin/key-requests?status=pending|approved|declined` lists requests. `POST /v1/admin/key-requests/decide` with `{ id, decision: "approve" | "decline" }`: approving issues a key (returned once, labelled with the requester's email and project). `deploy/key-requests.mjs` wraps both.
- `GET /v1/admin/issues?since=<ms>&limit=<1-500>&audio=1` exports issue reports, oldest first: `{ issues: [...], next_since }`. Without `audio=1`, each row has `has_audio` instead of the clip. Page by passing `next_since` back as `since`.

### Errors

Every error looks like `{ "error": { "code": string, "message": string, "job_id"?: string } }`.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_json`, `invalid_messages`, `invalid_language`, `invalid_audio`, `missing_user`, `invalid_issue`, `invalid_request` | Bad request |
| 401 | `missing_api_key`, `invalid_api_key`, `invalid_admin_token` | Auth |
| 413 | `audio_too_large`, `issue_too_large` | Over a size limit |
| 429 | `license_cap_reached` | 1,000 active end-users reached; only new users are refused |
| 502 | `backend_error`, `upstream_error`, `upstream_failed`, `model_error`, `unexpected_upstream_shape`, `backend_auth_failed`, `backend_route_missing` | The backend or the model failed on this request. Not retried by the SDK |
| 503 | `upstream_not_configured`, `backend_unavailable` | No backend connected, or it's down or still loading models |
| 504 | `upstream_timeout` | Didn't finish within the gateway's wait (default 300 s) |

## SDK

```ts
import { OpenAtlas, OpenAtlasAPIError, OpenAtlasTimeoutError, normalizeText } from "openatlas";

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

Retries: network errors and 503 are retried with backoff (1 s, 2 s, …), up to `maxRetries`. 4xx, 502 and 504 errors are never retried. A `429 license_cap_reached` won't go away by retrying.

## Language codes

| Code | `chat()` | `transcribe()` |
|---|---|---|
| `ha` | Hausa | `NCAIR1/Hausa-ASR` |
| `yo` | Yoruba | `NCAIR1/Yoruba-ASR` |
| `ig` | Igbo | `NCAIR1/Igbo-ASR` |
| `en` | English | — |
| `en-ng` | — | `NCAIR1/NigerianAccentedEnglish` |
