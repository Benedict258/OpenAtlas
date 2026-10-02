# OpenAtlas

One TypeScript SDK for **N-ATLaS**: Nigeria's open LLM and its Hausa, Yoruba, Igbo and Nigerian-accented-English speech recognition models.

| Method | What you get |
|---|---|
| `chat()` | N-ATLaS text generation in English, Hausa, Yoruba or Igbo. One method; no model-format knowledge needed |
| `transcribe()` | Speech-to-text, routed to the right one of the four N-ATLaS ASR models by language code |
| `normalizeText()` | Repairs Nigerian-language text whose special characters were corrupted by typing or scraping (`Æ™asa` → `ƙasa`, `Şé` → `Ṣé`) |
| `reportIssue()` | Flags a wrong N-ATLaS output with its correction: every app becomes an opt-in source of corrected local-language data |
| `speak()` *(stretch)* | Spoken Hausa/Yoruba/Igbo/Pidgin. Not built yet |

Plus three starter kits (citizen services, education, customer service) that use all of it, and a website with the kits running live: **https://openatlas-site.isaacbenedict001.workers.dev**.

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.
>
> OpenAtlas is a **non-commercial developer and research resource**. N-ATLaS's Terms of Use cap usage at **1,000 active end-users per rolling 30 days**; the gateway enforces that cap.

> **Status (2026-10-02):** the gateway is live at `https://openatlas-gateway.isaacbenedict001.workers.dev`, and `reportIssue()` and `normalizeText()` work against it today. `chat()` and `transcribe()` return `503 upstream_not_configured` until a GPU backend is connected. The next step is an interim Colab backend, then the persistent NiHub host. This notice will be updated once a real N-ATLaS request has gone end to end.

## Quickstart

```bash
npm install openatlas
```

```ts
import { OpenAtlas, normalizeText } from "openatlas";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });

const response = await client.chat({
  messages: [{ role: "user", content: normalizeText("Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?", { language: "yo" }) }],
  user: "your-end-user-id", // required: counts active users against the license cap
});
console.log(response.content);

// The answer was wrong? Send the correction back.
await client.reportIssue({ kind: "chat", input: "…", output: response.content, correction: "…", language: "yo" });
```

**Getting a key:** request one with the form at [https://openatlas-site.isaacbenedict001.workers.dev/request-key](https://openatlas-site.isaacbenedict001.workers.dev/request-key). Keys are reviewed and issued by hand (there is no signup dashboard). The SDK points at the hosted gateway by default.

**Not published to npm yet.** Until it is, install from this repo: `npm install ./packages/sdk` (after `npm run build`).

**First-call latency:** the first request after the backend starts can be slow while models load. Measured warm response times: **[PLACEHOLDER: not yet measured]**. The SDK waits up to 5 minutes by default.

## Why OpenAtlas

N-ATLaS ships as five separate model repos with their own calling conventions. The LLM needs specific settings to behave: the current date in its chat template, and a repetition penalty. Nigerian-language text arrives with broken diacritics. And the field is short of newly contributed data. OpenAtlas handles the first three in one SDK and turns apps into contributors for the fourth. It adds no model capability of its own: every answer and every transcript comes from an N-ATLaS model.

## API reference

Full details: [docs/api-reference.md](docs/api-reference.md).

### `new OpenAtlas(options?)`

| Option | Default | |
|---|---|---|
| `apiKey` | `process.env.OPENATLAS_API_KEY` | Your OpenAtlas key |
| `baseURL` | `process.env.OPENATLAS_BASE_URL`, then the hosted gateway | Gateway URL |
| `timeoutMs` | `300000` | Per request; long because models may be loading |
| `maxRetries` | `2` | Retries network errors and 502/503 only |
| `normalize` | `false` | Apply `normalizeText()` to chat messages, replies and transcripts automatically |

### `client.chat({ messages, user, language?, max_tokens?, temperature? })` → `{ content, model, usage }`

Text generation with the N-ATLaS LLM. `language` (`en`, `ha`, `yo`, `ig`) adds a "Respond in …" instruction; it doesn't switch models.

### `client.transcribe({ audio, language, user })` → `{ text, language, model }`

Speech-to-text with the N-ATLaS ASR model for `language`. `audio` is raw bytes (`Uint8Array`/`ArrayBuffer`/`Buffer`) or a base64 string, in any common format (wav, mp3, ogg, webm, m4a). Maximum about 7 MB.

### `normalizeText(text, { language?, hausaApostrophes? })` → `string`

Local, no network (also available as `client.normalizeText`). Repairs:
- **Encoding damage:** UTF-8 read as Windows-1252/Latin-1 (`á»` → `ọ`, `Æ™` → `ƙ`)
- **Look-alike letters** (with `language`): Hausa `ķ`→`ƙ`, `ɖ`→`ɗ`; Yoruba/Igbo cedilla or ogonek in place of the dot below (`ş`→`ṣ`, `ę`→`ẹ`, `ǫ`→`ọ`, `į`→`ị`, `ų`→`ụ`), keeping tone marks
- **Invisible characters** (zero-width spaces, BOM, soft hyphens) and Unicode composition (NFC)
- **Hausa apostrophe spellings** (opt-in, `hausaApostrophes: true`): `k'asa` → `ƙasa`, `d'aya` → `ɗaya`

It does **not** add tone marks that were never typed: missing marks stay missing. Restoring them needs a model; N-ATLaS-based tone restoration is a roadmap item only.

### `client.reportIssue({ kind, output, correction, input?, language?, note?, audio?, user? })` → `{ id, received_at }`

Records a wrong N-ATLaS output and its correction. `kind` is `"chat"` (needs `input`, the prompt) or `"transcription"` (can include `audio`, up to ~1 MB base64, so the corrected transcript is paired with its audio). Reports are stored by OpenAtlas and exportable as a correction dataset. Nothing is stored unless you call this, so tell your users when you do. `user` is optional here and hashed.

### `user` is required on `chat` and `transcribe`

N-ATLaS's license caps usage at 1,000 active **end users** per rolling 30 days, meaning the people interacting with N-ATLaS output through your app. So every call must include `user`: a stable, opaque ID for the person your app is serving, such as a database ID or a random per-browser ID. Don't send names or emails. The gateway hashes the ID and uses it only for this count. Requests without it are refused with `400 missing_user`.

### Errors

| Class | When |
|---|---|
| `OpenAtlasAPIError` | Gateway returned an error. Has `.status`, `.code` (e.g. `invalid_api_key`, `missing_user`, `license_cap_reached`, `backend_unavailable`, `upstream_timeout`, `audio_too_large`) and `.jobId` |
| `OpenAtlasTimeoutError` | No response within `timeoutMs`. Retry shortly |
| `OpenAtlasConnectionError` | Gateway unreachable |

## Language codes

| Code | Language | `chat()` | `transcribe()` model |
|---|---|---|---|
| `ha` | Hausa | ✓ | `NCAIR1/Hausa-ASR` |
| `yo` | Yoruba | ✓ | `NCAIR1/Yoruba-ASR` |
| `ig` | Igbo | ✓ | `NCAIR1/Igbo-ASR` |
| `en` | English | ✓ | (use `en-ng`) |
| `en-ng` | Nigerian-accented English | (use `en`) | `NCAIR1/NigerianAccentedEnglish` |

`chat()` always uses `NCAIR1/N-ATLaS`, a Llama-3 8B fine-tune. The ASR models are Whisper-small fine-tunes.

## Starter kits

Minimal reference implementations, not products. Each one runs with `npm install && npm start`.

- [Citizen Services](starter-kits/citizen-services/): local-language Q&A over a small, labeled demo dataset. The question goes through `normalizeText()`, then `chat()`.
- [Education](starter-kits/education/): tutor explanations at primary or secondary level (`chat()`), with **Report a wrong answer** (`reportIssue()`).
- [Customer Service](starter-kits/customer-service/): a voice note goes through `transcribe()` → `normalizeText()` → `chat()` for triage and a drafted reply, with **Correct this transcript** (`reportIssue()` with the audio).

## How it's built

```
your app → openatlas SDK → OpenAtlas gateway (Cloudflare Worker + D1) → GPU backend
                            · OpenAtlas keys                               natlas_server.py:
                            · 1,000-user cap accounting                    · N-ATLaS LLM (4-bit)
                            · issue reports                                · N-ATLaS ASR ×4
                            · backend credential stays here
```

The backend is a config value, not code: `deploy/set-backend.mjs <url> <key>` repoints the live gateway. Hosting plan:
- **Google Colab** (`deploy/colab/openatlas_colab.ipynb`): **interim dev/test only.** Not persistent: it disconnects when idle, sessions end after about 12 hours, and the URL changes every run.
- **NiHub:** the intended persistent host for submission and judging. Not live yet.
- **RunPod Serverless:** fallback (`BACKEND_KIND=runpod`, scripts in `deploy/llm`, `deploy/asr`). Not deployed.

Repo map:
- [`packages/sdk`](packages/sdk/): the `openatlas` npm package
- [`gateway`](gateway/): Worker and D1 schema
- [`deploy/server`](deploy/server/): the backend server (`natlas_server.py`) and the notebook generator
- [`deploy/set-backend.mjs`](deploy/set-backend.mjs), [`deploy/smoke-gateway.mjs`](deploy/smoke-gateway.mjs): point the gateway at a backend, then run real calls through it
- [`site`](site/): the website (Cloudflare Worker + static pages converted from the original design file). Its Starter kits page runs the kits' own `kit.mjs` and window markup; see [`site/DESIGN_CHANGES.md`](site/DESIGN_CHANGES.md) for every copy change from the design
- [`deploy/key-requests.mjs`](deploy/key-requests.mjs): list, approve (issues a key) or decline requests from the website form
- [`dev/mock-backend`](dev/mock-backend/): **mock** backend for local development only. Every output is prefixed `[MOCK — not N-ATLaS output]`, and `/v1/health` reports `"mock": true`
- [`dev/fetch-test-audio.mjs`](dev/fetch-test-audio.mjs): real speech clips with human reference transcripts, for testing `transcribe()`

## Known limitations

- **Hosting is interim until NiHub is live.** On Colab the service is only up while the notebook runs.
- **License cap.** At most 1,000 active end-users per rolling 30 days across the whole hosted service. New users get `429 license_cap_reached` once it's reached; existing users keep working. The count is only as accurate as the `user` IDs apps send.
- **Non-commercial.** Commercial or large-scale use needs a separate license from Awarri Technologies and the Federal Ministry.
- **Model quality varies by language.** N-ATLaS's own human evaluation (from its model card) gives average scores of English 4.21/5, Hausa 3.98, Igbo 3.87 and **Yoruba 2.69**. OpenAtlas hasn't run its own evaluation.
- **Speech-recognition limitations stated by N-ATLaS:** dialect and accent bias, reduced accuracy on children's speech, limited handling of code-switching, and worse performance in noise.
- **`normalizeText()` repairs; it doesn't restore.** Missing tone marks stay missing.
- **`reportIssue()` collects; it doesn't deliver yet.** There's no agreed channel to the N-ATLaS maintainers yet.
- **Context length:** about 8k tokens. **Audio:** about 7 MB per request.
- **No uptime or SLA claims.**
- **`speak()` isn't included.** It's an optional, separate text-to-speech renderer, not N-ATLaS, and isn't built yet.

## License and terms

OpenAtlas's own code is [MIT-licensed](LICENSE). The N-ATLaS models aren't part of this repo; they remain under the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS), which apply whenever you use the hosted service. Prohibited uses under those terms include surveillance, discriminatory profiling, disinformation or impersonation, military use, and unauthorized personal-data scraping.
