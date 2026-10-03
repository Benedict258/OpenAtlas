# OpenAtlas

One TypeScript SDK for **N-ATLaS**: Nigeria's open LLM and its Hausa, Yoruba, Igbo and Nigerian-accented-English speech recognition models.

| Method | What you get |
|---|---|
| `chat()` | N-ATLaS text generation in English, Hausa, Yoruba or Igbo. One method; no model-format knowledge needed |
| `transcribe()` | Speech-to-text, routed to the right one of the four N-ATLaS ASR models by language code |
| `normalizeText()` | Repairs Nigerian-language text whose special characters were corrupted by typing or scraping (`Æ™asa` → `ƙasa`, `Şé` → `Ṣé`) |
| `reportIssue()` | Flags a wrong N-ATLaS output with its correction: every app becomes an opt-in source of corrected local-language data |
| `speak()` *(stretch)* | The ElevenLabs gap for Nigerian languages: spoken Hausa/Yoruba/Igbo/Pidgin. Not built; waiting on an NAIC eligibility answer |

Plus three starter kits (citizen services, education, customer service) that use all of it, and a website with the kits running live: **https://openatlas-site.isaacbenedict001.workers.dev**.

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.
>
> OpenAtlas is a **non-commercial developer and research resource**. N-ATLaS's Terms of Use cap usage at **1,000 active end-users per rolling 30 days**; the gateway enforces that cap.

> **Status (2026-10-03):**
> - **Checked against the real N-ATLaS models through the public gateway:** `chat()` in English, Hausa, Yoruba and Igbo; `transcribe()` in all four ASR languages on 90 real recordings; `reportIssue()`; and all three starter kits in a browser on the live website.
> - **Evidence:** every check, with verbatim outputs, timings and failures, is in [`deploy/REPORT.md`](deploy/REPORT.md).
> - **Hosting is interim:** the models run on Google Colab, which is up only while the notebook runs. At other times calls return `503 backend_unavailable`. NiHub is the planned persistent host.

## Quickstart

```bash
npm install openatlas   # not on npm yet: until it is, use `npm install ./packages/sdk` from this repo (after `npm run build`)
```

```ts
import { OpenAtlas, normalizeText } from "openatlas";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });

// Repairs text whose special characters were corrupted on the way in ("zaÉ“e" → "zaɓe").
const question = normalizeText("Ina zan je don yin rajistar katin zaÉ“e?", { language: "ha" });

const response = await client.chat({
  messages: [{ role: "user", content: question }],
  language: "ha",
  user: "your-end-user-id", // required: a stable, opaque ID for your end user (license-cap counting)
});
console.log(response.content);
console.log(`${response.model}, ${response.attribution}`); // NCAIR1/N-ATLaS, Powered by Awarri
```

This is [`examples/quickstart.mjs`](examples/quickstart.mjs). Run on 2026-10-03 against the hosted gateway, it took 6 s and printed:

```
Ina zan je don yin rajistar katin zaɓe?
Don yin rijistar katin zabe, ya kamata ku ziyarci ofishin zabe na gida a unguwar ku ko jihar ku.
NCAIR1/N-ATLaS, Powered by Awarri
```

(In English, the answer says: "To register for a voter card, you should visit the local electoral office in your area or state." N-ATLaS answers are often this general; see [Known limitations](#known-limitations).)

**Getting a key:** request one with the form at [https://openatlas-site.isaacbenedict001.workers.dev/request-key](https://openatlas-site.isaacbenedict001.workers.dev/request-key). Keys are reviewed and issued by hand; there is no signup dashboard. The SDK points at the hosted gateway by default.

**Response times** (measured 2026-10-02/03 through the gateway, with the models already loaded):

| Call | Typical | Range seen |
|---|---|---|
| `chat()`, English, Hausa, Igbo | 5–13 s | 4.5–17 s; long answers up to 35 s |
| `chat()`, Yoruba | 15–20 s | 7.5–23 s |
| `transcribe()`, ≤30 s of audio | 2–6 s | 1.7–11.8 s |

The SDK waits up to 5 minutes by default, so a backend that is still loading its models doesn't fail the call. Startup time on a fresh backend hasn't been measured.

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
| `maxRetries` | `2` | Retries network errors and 503 only |
| `normalize` | `false` | Apply `normalizeText()` to chat messages, replies and transcripts automatically |

### `client.chat({ messages, user, language?, max_tokens?, temperature? })` → `{ content, model, attribution, usage }`

Text generation with the N-ATLaS LLM. `language` (`en`, `ha`, `yo`, `ig`) adds a "Respond in …" instruction; it doesn't switch models. `model` is `"NCAIR1/N-ATLaS"`. `attribution` is `"Powered by Awarri"`, the credit N-ATLaS's terms require: show it wherever you show the output.

### `client.transcribe({ audio, language, user })` → `{ text, language, model, attribution }`

Speech-to-text with the N-ATLaS ASR model for `language`. `model` is that model's ID (e.g. `"NCAIR1/Hausa-ASR"`).

`audio` can be raw bytes (`Uint8Array`/`ArrayBuffer`/`Buffer`), a `Blob`/`File` (e.g. a browser recording) or a base64 string.
- **Formats:** anything ffmpeg decodes: wav, mp3, ogg, flac, and the webm (Chrome, Firefox) and m4a (Safari) that browsers record. Checked live on 2026-10-03.
- **Length:** **30 seconds or less per request is the reliable range.** Longer audio is accepted: the backend cuts it into plain 25 s pieces. But on very long free speech (90 s and more) some words are still lost (see [Known limitations](#known-limitations)). For long recordings, split them yourself and check each part.
- **Size:** about 7 MB per request. The SDK refuses larger audio before uploading. 16 kHz mono WAV, which is what the models use internally, is about 32 KB per second.

### `normalizeText(text, { language?, hausaApostrophes? })` → `string`

Local, no network (also available as `client.normalizeText`). Repairs:
- **Encoding damage:** UTF-8 read as Windows-1252/Latin-1 (`á»` → `ọ`, `Æ™` → `ƙ`)
- **Look-alike letters** (with `language`): Hausa `ķ`→`ƙ`, `ɖ`→`ɗ`; Yoruba/Igbo cedilla or ogonek in place of the dot below (`ş`→`ṣ`, `ę`→`ẹ`, `ǫ`→`ọ`, `į`→`ị`, `ų`→`ụ`), keeping tone marks
- **Invisible characters** (zero-width spaces, BOM, soft hyphens) and Unicode composition (NFC)
- **Hausa apostrophe spellings** (opt-in, `hausaApostrophes: true`): `k'asa` → `ƙasa`, `d'aya` → `ɗaya`

It does **not** add tone marks that were never typed: missing marks stay missing. Restoring them needs a model; N-ATLaS-based tone restoration is a roadmap item only.

### `client.reportIssue({ kind, output, correction, input?, language?, note?, audio?, user? })` → `{ id, received_at }`

Records a wrong N-ATLaS output and its correction. `kind` is `"chat"` (needs `input`, the prompt) or `"transcription"` (can include `audio`, up to ~1 MB base64, so the corrected transcript is paired with its audio). Reports are stored by OpenAtlas and exportable as a correction dataset. Nothing is stored unless you call this, so tell your users when you do. `user` is optional here and hashed.

### `buildPrompt(spec, input)` → `messages`

Local, no network. Builds a structured system prompt for `chat()`. OpenAtlas supplies a base layer: role line, rules (follow the task; reply language; keep format labels in English; don't guess; be concise). Your app adds its own `role`, `task`, and optional `reference`, `format`, `example` and `reminder` (repeated after the user's input).

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

Measured on the starter kits (deploy/REPORT.md, section 18):
- **Customer Service:** the three-line format was followed 10/10, against 3/10 for the previous free-form prompt.
- **Citizen Services:** out-of-scope questions were declined cleanly 5/6, against 1/6.
- **Education:** no measurable change, so it keeps its own prompt.

Two cautions from the same measurements:
- **Examples are copied closely,** including their language: write an example reply in the reply language.
- **With fixed format labels, don't pass `language` to `chat()`:** the gateway's added "Respond in …" line comes last, and it made the model translate the labels.

### `user` is required on `chat` and `transcribe`

N-ATLaS's license caps usage at 1,000 active **end users** per rolling 30 days, meaning the people interacting with N-ATLaS output through your app. So every call must include `user`: a stable, opaque ID for the person your app is serving, such as a database ID or a random per-browser ID. Don't send names or emails. The gateway hashes the ID and uses it only for this count. Requests without it are refused with `400 missing_user`.

### Errors

| Class | When |
|---|---|
| `OpenAtlasAPIError` | The gateway returned an error. Has `.status`, `.code` and `.jobId`. Codes include `invalid_api_key`, `missing_user`, `license_cap_reached`, `backend_unavailable` (503: no backend is serving right now; retried automatically), `backend_error` (502: the backend failed on this particular request; not retried), `upstream_timeout` and `audio_too_large` |
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

- [Citizen Services](starter-kits/citizen-services/): local-language Q&A over a small, labeled demo dataset. The question goes through `normalizeText()`, then `chat()`. **Checked live**; running on the website.
- [Education](starter-kits/education/): tutor explanations at primary or secondary level (`chat()`), with **Report a wrong answer** (`reportIssue()`). **Checked live**; running on the website.
- [Customer Service](starter-kits/customer-service/): a voice note goes through `transcribe()` → `normalizeText()` → `chat()` for triage and a drafted reply, with **Correct this transcript** (`reportIssue()` with the audio). Recording stops at 30 s; longer uploads are split into parts, with a warning before sending. **Checked live**; running on the website.

## How it's built

```
your app → openatlas SDK → OpenAtlas gateway (Cloudflare Worker + D1) → GPU backend
                            · OpenAtlas keys                               natlas_server.py:
                            · 1,000-user cap accounting                    · N-ATLaS LLM (4-bit)
                            · issue reports                                · N-ATLaS ASR ×4
                            · backend credential stays here
```

The backend is a config value, not code: `deploy/set-backend.mjs <url> <key>` repoints the live gateway. Hosting plan:
- **Google Colab** ([`natlas_colab.ipynb`](natlas_colab.ipynb), the notebook currently serving): **interim only.** Not persistent: it disconnects when idle, sessions end after about 12 hours, and the URL changes on every run. `deploy/colab/openatlas_colab.ipynb` is the same idea, generated from `natlas_server.py`.
- **NiHub:** the intended persistent host for submission and judging. Not live yet.
- **RunPod Serverless:** fallback (`BACKEND_KIND=runpod`, scripts in `deploy/llm`, `deploy/asr`). Not deployed.

Repo map:
- [`packages/sdk`](packages/sdk/): the `openatlas` npm package
- [`gateway`](gateway/): Worker and D1 schema
- [`deploy/server`](deploy/server/): the backend server (`natlas_server.py`) and the notebook generator
- [`deploy/set-backend.mjs`](deploy/set-backend.mjs), [`deploy/smoke-gateway.mjs`](deploy/smoke-gateway.mjs): point the gateway at a backend, then run real calls through it
- [`site`](site/): the website (Cloudflare Worker + static pages converted from the Claude Design file). Its Starter kits page runs the kits' own `kit.mjs` and window markup; see [`site/DESIGN_CHANGES.md`](site/DESIGN_CHANGES.md) for every copy change from the design
- [`deploy/key-requests.mjs`](deploy/key-requests.mjs): list, approve (issues a key) or decline requests from the website form
- [`dev/mock-backend`](dev/mock-backend/): **mock** backend for local development only. Every output is prefixed `[MOCK — not N-ATLaS output]`, and `/v1/health` reports `"mock": true`
- [`dev/fetch-test-audio.mjs`](dev/fetch-test-audio.mjs), [`dev/fetch-asr-eval.mjs`](dev/fetch-asr-eval.mjs), [`deploy/asr-eval.mjs`](deploy/asr-eval.mjs): real speech clips with human reference transcripts, and the multi-clip WER evaluation that uses them
- [`deploy/REPORT.md`](deploy/REPORT.md): the running record of every check against the live models
- [`examples/quickstart.mjs`](examples/quickstart.mjs): the quickstart above, runnable

## Known limitations

Measured, not estimated. Details and verbatim outputs are in [`deploy/REPORT.md`](deploy/REPORT.md).

**Hosting and access**
- **Hosting is interim until NiHub is live.** On Colab the service is up only while the notebook runs. At other times calls return `503 backend_unavailable`. There are no uptime or SLA claims.
- **License cap.** N-ATLaS's terms allow at most 1,000 active end users per rolling 30 days across the whole hosted service. Once the cap is reached, new users get `429 license_cap_reached`; existing users keep working. The count is only as accurate as the `user` IDs apps send.
- **Non-commercial.** Commercial or large-scale use needs a separate license from Awarri Technologies and the Federal Ministry.
- **Shared demo key is not rate-limited.** The website's live demos share one OpenAtlas key (`website-demos`). Anyone could send made-up user IDs through it and use up the 1,000-user cap. Its usage shows separately in the gateway's `/v1/usage` report. Per-IP limits are not built.

**`chat()` quality**
- **Quality varies by language.** N-ATLaS's own human evaluation (model card) scores English 4.21/5, Hausa 3.98, Igbo 3.87 and **Yoruba 2.69**. Our runs agree:
  - English, Hausa and Igbo answers were fluent and on-topic.
  - Yoruba answers often lack tone marks and are slower (7.5–23 s).
- **Yoruba replies can degenerate into repeated syllables.** For example "afẹ́fẹ́fẹ́…", until the token limit. This happened in 1 of 11 runs of one prompt, plus stutters that recovered. A repetition guard (`no_repeat_ngram_size`) was tried, didn't help, and was removed. The Citizen Services demo opens in Hausa for this reason.
- **Factual slips happen.** Examples seen:
  - NIMC described as handling e-passports (that's the Immigration Service);
  - glucose called "a sweet drink";
  - a chemical equation missing a coefficient.
- **Instructions are followed loosely with free-form prompts.** A structured prompt ([`buildPrompt()`](#buildpromptspec-input--messages)) measurably helps in two kits (deploy/REPORT.md, section 18):
  - **Citizen Services, answering only from given notes:**
    - with its previous prompt, N-ATLaS declined cleanly on 1 of 6 out-of-scope questions, and gave general advice or invented details on the others;
    - with the structured prompt it declined cleanly on 5 of 6;
    - one, a farm-loan question, was still answered from outside knowledge.
  - **Customer Service:**
    - with its previous prompt, the fixed three-line format was followed in 3 of 10 drafts; Yoruba and Igbo drafts translated the format labels;
    - with the structured prompt it was followed in 10 of 10;
    - choosing the right category is still hit and miss: 6–8 of 10.
  - **Education:** asked for secondary-school level, N-ATLaS sometimes answers as if to a young child. A structured prompt did not measurably fix this.
  - **Website:** the structured prompts are in the kits' code, but not yet on the website's demos.

**`transcribe()` quality**, word error rate (WER) on 10–20 real recordings per source (2026-10-02). These are small samples, not benchmarks, and the clips may overlap the models' training data:

| Language | Recordings | WER | WER ignoring tone marks |
|---|---|---|---|
| Hausa | conversational, 20–30 s | 41% | 41% |
| Yoruba | conversational, 20–30 s | 56% | 45% |
| Igbo | short dictionary sentences | 26% | 23% |
| Igbo | IgboSynCorp, every syllable tone-marked, several dialects | 101% (the model doesn't write tone marks) | 61% |
| Nigerian English | read and spontaneous speech | 26% | 26% |

- **Long audio:**
  - **30 s or less per request is the reliable range.**
  - Whisper's built-in chunking lost words on longer clips: transcripts were 39–79% of reference length. It was replaced by plain 25 s pieces.
  - That brought 38–54 s clips back to 83–99% of the words, with WER 22–47% instead of 55–81%.
  - On 89–123 s free speech, transcripts still had only 63–85% of the words.
- **Stated by N-ATLaS:** dialect and accent bias, reduced accuracy on children's speech, limited handling of code-switching, and worse performance in noise.

**OpenAtlas methods**
- **`normalizeText()` repairs; it doesn't restore.** Missing tone marks stay missing.
- **`reportIssue()` collects; it doesn't deliver yet.** There is no agreed channel to the N-ATLaS maintainers yet.
- **Context length:** about 8k tokens.
- **`speak()` isn't included.** It's a stretch component waiting on an eligibility clarification from NAIC.

## License and terms

OpenAtlas's own code is [MIT-licensed](LICENSE). The N-ATLaS models aren't part of this repo; they remain under the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS), which apply whenever you use the hosted service. Prohibited uses under those terms include surveillance, discriminatory profiling, disinformation or impersonation, military use, and unauthorized personal-data scraping.
