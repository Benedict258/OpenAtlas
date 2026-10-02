# OpenAtlas

Developer infrastructure for **N-ATLaS**, Nigeria's open LLM plus its Hausa, Yoruba, Igbo and Nigerian-accented-English speech recognition models. OpenAtlas provides a hosted N-ATLaS deployment, one TypeScript SDK, and three starter kits, so you can build on N-ATLaS without a GPU and without learning five different model interfaces.

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.
>
> OpenAtlas is a **non-commercial developer and research resource**. N-ATLaS's Terms of Use cap usage at **1,000 active end-users per rolling 30 days**; the hosted gateway enforces that cap. Not a production or commercial service.

> **Status (2026-10-02): the gateway is live, but N-ATLaS isn't connected yet.** The gateway at `https://openatlas-gateway.isaacbenedict001.workers.dev` answers requests. Calls to `chat()` and `transcribe()` currently return `503 upstream_not_configured` until the RunPod model endpoints are deployed. This notice will be updated once a real N-ATLaS request has gone end to end.

## Quickstart

```bash
npm install openatlas
```

```ts
import { OpenAtlas } from "openatlas";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });

const response = await client.chat({
  messages: [{ role: "user", content: "Ṣe o le ṣàlàyé ìdí tí ọ̀run fi jẹ́ búlúù?" }],
  user: "your-end-user-id", // required: counts active users against the license cap
});

console.log(response.content);
```

**Getting a key:** API keys are issued by hand for this submission (there is no signup dashboard). Request one from the maintainer. The SDK points at the hosted gateway, `https://openatlas-gateway.isaacbenedict001.workers.dev`, by default.

**Not published to npm yet.** Until it is, install from this repo: `npm install ./packages/sdk` (after `npm run build`).

**What to expect on the first call:** the endpoint scales to zero when idle, so the first request after a quiet period includes loading the model (a *cold start*). Measured cold-start time: **[PLACEHOLDER: not yet measured]**. Measured warm response time: **[PLACEHOLDER: not yet measured]**. The SDK waits up to 5 minutes by default.

## Why OpenAtlas

N-ATLaS ships as five separate model repos. Using them today means getting gated access, finding and paying for a GPU, serving an 8B-parameter model, and wiring up four different speech checkpoints. OpenAtlas does that once, behind one API, and shows with working code what an N-ATLaS-native app looks like. It adds no model capability of its own: every answer and every transcript comes from an N-ATLaS model.

## API reference

Full details: [docs/api-reference.md](docs/api-reference.md).

### `new OpenAtlas(options?)`

| Option | Default | |
|---|---|---|
| `apiKey` | `process.env.OPENATLAS_API_KEY` | Your OpenAtlas key |
| `baseURL` | `process.env.OPENATLAS_BASE_URL`, then the hosted gateway | Gateway URL |
| `timeoutMs` | `300000` | Per request; long because of cold starts |
| `maxRetries` | `2` | Retries network errors and 502/503 only |

### `client.chat({ messages, user, language?, max_tokens?, temperature? })` → `{ content, model, usage }`

Text generation with the N-ATLaS LLM. `language` (`en`, `ha`, `yo`, `ig`) adds a "Respond in …" instruction; it doesn't switch models.

### `client.transcribe({ audio, language, user })` → `{ text, language, model }`

Speech-to-text with the N-ATLaS ASR model for `language`. `audio` is raw bytes (`Uint8Array`/`ArrayBuffer`/`Buffer`) or a base64 string, in any common format (wav, mp3, ogg, webm, m4a). Maximum about 7 MB.

### `user` is required

N-ATLaS's license caps usage at 1,000 active **end users** per rolling 30 days, meaning the people interacting with N-ATLaS output through your app. So every call must include `user`: a stable, opaque ID for the person your app is serving, such as a database ID or a random per-browser ID. Don't send names or emails. The gateway hashes the ID and uses it only for this count. Requests without it are refused with `400 missing_user`.

### Errors

| Class | When |
|---|---|
| `OpenAtlasAPIError` | Gateway returned an error. Has `.status`, `.code` (e.g. `invalid_api_key`, `missing_user`, `license_cap_reached`, `upstream_timeout`, `audio_too_large`) and `.jobId` |
| `OpenAtlasTimeoutError` | No response within `timeoutMs`, usually a cold start. Retry shortly |
| `OpenAtlasConnectionError` | Gateway unreachable |

## Language codes

| Code | Language | `chat()` | `transcribe()` model |
|---|---|---|---|
| `ha` | Hausa | ✓ | `NCAIR1/Hausa-ASR` |
| `yo` | Yoruba | ✓ | `NCAIR1/Yoruba-ASR` |
| `ig` | Igbo | ✓ | `NCAIR1/Igbo-ASR` |
| `en` | English | ✓ | (use `en-ng`) |
| `en-ng` | Nigerian-accented English | (use `en`) | `NCAIR1/NigerianAccentedEnglish` |

`chat()` always uses `NCAIR1/N-ATLaS`, a Llama-3 8B fine-tune.

## Starter kits

Minimal reference implementations, not products. Each one runs with `npm install && npm start`.

- [Citizen Services](starter-kits/citizen-services/): local-language Q&A over a small, labeled demo dataset (`chat()`).
- [Education](starter-kits/education/): tutor explanations at primary or secondary level (`chat()` with instructional framing).
- [Customer Service](starter-kits/customer-service/): a voice note is transcribed, then triaged and given a drafted reply (`transcribe()` → `chat()`).

## How it's built

```
your app → openatlas SDK → OpenAtlas gateway (Cloudflare Worker) → RunPod Serverless
                            · OpenAtlas keys                         · N-ATLaS LLM (vLLM)
                            · 1,000-user cap accounting              · N-ATLaS ASR ×4 (one worker)
                            · RunPod key stays here
```

- [`packages/sdk`](packages/sdk/): the `openatlas` npm package
- [`gateway`](gateway/): Worker and D1 schema
- [`deploy/llm`](deploy/llm/): creates the LLM endpoint and runs a real smoke test that records timings
- [`workers/asr`](workers/asr/): the ASR worker
- [`dev/mock-runpod`](dev/mock-runpod/): **mock** upstream for local development only. Every output is prefixed `[MOCK — not N-ATLaS output]`, and `/v1/health` reports `"upstream": "mock"`

## Known limitations

- **Cold starts.** Scale-to-zero keeps idle cost at zero but makes the first request slow. Measured: **[PLACEHOLDER: not yet measured]**.
- **License cap.** At most 1,000 active end-users per rolling 30 days across the whole hosted endpoint. New users get `429 license_cap_reached` once it's reached; existing users keep working. `user` is required on every call, but the count is only as accurate as the IDs apps send. An app that sends one ID for everyone would undercount.
- **Non-commercial.** Commercial or large-scale use needs a separate license from Awarri Technologies and the Federal Ministry. OpenAtlas is not a commercial offering.
- **Model quality varies by language.** N-ATLaS's own human evaluation (from its model card) gives average scores of English 4.21/5, Hausa 3.98, Igbo 3.87 and **Yoruba 2.69**. OpenAtlas hasn't run its own evaluation.
- **Speech-recognition limitations stated by N-ATLaS:** dialect and accent bias, reduced accuracy on children's speech, limited handling of code-switching, and worse performance in noise.
- **Context length:** about 8k tokens (the model card says 8,092).
- **Audio size:** about 7 MB per request.
- **No uptime or SLA claims.** This is new infrastructure that hasn't been load-tested.
- **Text-to-speech (`speak()`) isn't included.** It's a stretch component waiting on an eligibility clarification from NAIC.

## License and terms

OpenAtlas's own code is [MIT-licensed](LICENSE). The N-ATLaS models aren't part of this repo; they remain under the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS), which apply whenever you use the hosted endpoint. Prohibited uses under those terms include surveillance, discriminatory profiling, disinformation or impersonation, military use, and unauthorized personal-data scraping.
