# OpenAtlas API reference

There are two ways to use it: the TypeScript SDK (recommended) and the HTTP API it wraps. Both talk to the OpenAtlas gateway, never to RunPod directly.

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

Response `200`: `{ "content": string, "model": "n-atlas-llm", "usage": { prompt_tokens, completion_tokens, total_tokens } }`

The gateway also sends N-ATLaS two settings that the caller doesn't control. Both come from the earlier Colab deployment, which was tested against the real weights:
- `repetition_penalty: 1.12`
- the current date (Africa/Lagos) as the chat template's `date_string`. Without it, the template tells the model "Today Date: 26 Jul 2024".

### `POST /v1/audio/transcriptions`

| Field | Type | Required | Notes |
|---|---|---|---|
| `audio` | base64 string | yes | Any format ffmpeg decodes. About 7 MB before encoding |
| `language` | `"en-ng"\|"ha"\|"yo"\|"ig"` | yes | Selects the ASR model |
| `user` | string | **yes** | As above |

Response `200`: `{ "text": string, "language": string, "model": "n-atlas-asr-<language>" }`

### `GET /v1/health` (no auth)

`{ "status": "ok", "upstream": "runpod" | "mock", "llm_configured": bool, "asr_configured": bool }`

### Admin (requires `Authorization: Bearer <ADMIN_TOKEN>`)

- `POST /v1/admin/keys` with `{ "label": string }` returns `201 { id, label, key }`. The key is shown once and stored only as a SHA-256 hash.
- `GET /v1/usage` returns `{ window_days, cap, active_users, requests_in_window, by_key: [{label, active_users}] }`.

### Errors

Every error looks like `{ "error": { "code": string, "message": string, "job_id"?: string } }`.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_json`, `invalid_messages`, `invalid_language`, `invalid_audio`, `missing_user` | Bad request |
| 401 | `missing_api_key`, `invalid_api_key`, `invalid_admin_token` | Auth |
| 413 | `audio_too_large` | Over ~7 MB of audio |
| 429 | `license_cap_reached` | 1,000 active end-users reached; only new users are refused |
| 502 | `upstream_error`, `upstream_failed`, `model_error`, `unexpected_upstream_shape` | RunPod or the model failed |
| 503 | `upstream_not_configured` | Gateway not yet connected to a RunPod endpoint |
| 504 | `upstream_timeout` | Didn't finish within the gateway's wait (default 300 s), usually a cold start |

## SDK

```ts
import { OpenAtlas, OpenAtlasAPIError, OpenAtlasTimeoutError } from "openatlas";

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
```

Retries: network errors and 502/503 are retried with backoff (1 s, 2 s, …), up to `maxRetries`. 4xx errors are never retried. A `429 license_cap_reached` won't go away by retrying.

## Language codes

| Code | `chat()` | `transcribe()` |
|---|---|---|
| `ha` | Hausa | `NCAIR1/Hausa-ASR` |
| `yo` | Yoruba | `NCAIR1/Yoruba-ASR` |
| `ig` | Igbo | `NCAIR1/Igbo-ASR` |
| `en` | English | — |
| `en-ng` | — | `NCAIR1/NigerianAccentedEnglish` |
