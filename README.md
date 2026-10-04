# OpenAtlas

**Developer infrastructure for N-ATLaS**, Nigeria's open language model and its Hausa, Yoruba, Igbo and Nigerian-English speech recognition models. It has four parts:
- **A TypeScript SDK on npm.**
- **A hosted, license-aware gateway.**
- **Three starter apps.**
- **A one-command way to run the whole stack yourself.**

- **Live site and demos:** https://openatlas-site.isaacbenedict001.workers.dev
- **SDK:** `npm install @openatlas/sdk` ([npm](https://www.npmjs.com/package/@openatlas/sdk))
- **How N-ATLaS is integrated:** [`docs/natlas-integration.md`](docs/natlas-integration.md)
- **Run it yourself:** [`docs/deploy-your-own.md`](docs/deploy-your-own.md)
- **Every check we ran, with real outputs:** [`docs/REPORT.md`](docs/REPORT.md)

> N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies. OpenAtlas is a **non-commercial** developer and research resource. N-ATLaS's terms cap use at **1,000 active end users per 30 days**, and the gateway enforces that cap.

## What it does

N-ATLaS ships as five separate model repositories, each with its own calling conventions. The LLM needs specific settings to behave well: the current date in its chat template, and a repetition penalty. Nigerian-language text often arrives with broken special characters. OpenAtlas puts all of that behind one SDK:

| SDK method | What it does | N-ATLaS model |
|---|---|---|
| `chat()` | Text generation in English, Hausa, Yoruba or Igbo | `NCAIR1/N-ATLaS` (Llama-3 8B fine-tune) |
| `transcribe()` | Speech to text, routed to the right model by language code | `NCAIR1/Hausa-ASR`, `NCAIR1/Yoruba-ASR`, `NCAIR1/Igbo-ASR`, `NCAIR1/NigerianAccentedEnglish` |
| `normalizeText()` | Repairs corrupted Nigerian-language characters (`Æ™asa` → `ƙasa`, `Şé` → `Ṣé`); runs locally | — |
| `reportIssue()` | Sends a wrong output plus its correction back as a dataset, so apps contribute data | — |
| `speak()` *(optional)* | Reads N-ATLaS's reply aloud with a separate speech model. Clear in English, experimental in other languages | — (SoroTTS / MMS-TTS) |

**Every answer and every transcript comes from an N-ATLaS model.** There is no fallback to any other LLM. Responses carry the model's Hugging Face ID and the "Powered by Awarri" attribution that N-ATLaS's terms require.

## Quickstart

```bash
npm install @openatlas/sdk
```

```ts
import { OpenAtlas, normalizeText } from "@openatlas/sdk";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });

const question = normalizeText("Ina zan je don yin rajistar katin zaÉ“e?", { language: "ha" }); // → "…zaɓe?"
const { content, model, attribution } = await client.chat({
  messages: [{ role: "user", content: question }],
  language: "ha",
  user: "your-end-user-id", // required: a stable, opaque ID for your end user (license-cap counting)
});
console.log(content);
console.log(`${model}, ${attribution}`); // NCAIR1/N-ATLaS, Powered by Awarri
```

This is [`sdk/examples/quickstart.mjs`](sdk/examples/quickstart.mjs). On 2026-10-04 it returned a Hausa answer from N-ATLaS on the AMD MI300X backend.

- **Getting a key:** use the [request form](https://openatlas-site.isaacbenedict001.workers.dev/request-key). Keys are reviewed and issued by hand.
- **Using it:** call the SDK from server-side code, since a key in a browser is public.
- **Reference:** the full API is in [`docs/api-reference.md`](docs/api-reference.md).

## Try it without code

The website's [Starter kits page](https://openatlas-site.isaacbenedict001.workers.dev/starter-kits) runs three reference apps live against N-ATLaS:
- **Citizen Services:** ask a civic question in Hausa, Yoruba, Igbo or English.
- **Education:** explanations at primary or secondary level.
- **Customer Service:** record a voice note. It is transcribed, triaged and given a drafted reply, with "Correct this transcript" sending the fix back.

**When the GPU backend is off,** each window says "Backend offline" (see Hosting below). The kits' code is in [`starter-kits/`](starter-kits/), and each runs on its own with `npm start`.

## How it's built

```
your app ── @openatlas/sdk ──▶ gateway (Cloudflare Worker + D1) ──HTTPS tunnel──▶ GPU backend (natlas_server.py)
                                · API keys (hashed), per-key limits                 · NCAIR1/N-ATLaS, bf16
                                · 1,000-user license cap (hashed user IDs)          · 4 × NCAIR1 ASR, fp16
                                · "Powered by Awarri" on every response             · optional speech renderer
```

**Hosting:**
- **Live, for judging:** the backend runs on an **AMD Instinct MI300X** (DigitalOcean AMD Developer Cloud, ROCm). That's 25 GB of GPU memory in use, with chat answered in under 1 s of GPU time (see [REPORT.md](docs/REPORT.md) section 29).
- **Why it may be offline:** the GPU is billed by the hour, so it's destroyed between sessions, and the demo isn't up around the clock.
- **Starting it:** one command, `node --env-file=.env deploy/amd/up.mjs <droplet-ip>`, brings a fresh droplet to serving and reconnects the gateway.
- **Why it moved:** no GPU hosting came with the challenge. Everything was first built and proven on **free tools:** a Kaggle notebook ([`deploy/colab/natlas_kaggle.ipynb`](deploy/colab/natlas_kaggle.ipynb)) and the Cloudflare free plan.
- **Running your own:** [`docs/deploy-your-own.md`](docs/deploy-your-own.md) shows anyone how to stand up the same deployment, on AMD, on Kaggle for free, or with Docker on their own GPU.

## Repository layout

| Folder | What's in it |
|---|---|
| [`sdk/`](sdk/) | `@openatlas/sdk`: source, tests, and [`examples/quickstart.mjs`](sdk/examples/quickstart.mjs) |
| [`gateway/`](gateway/) | The public API: a Cloudflare Worker with a D1 database (keys, license cap, limits, corrections) |
| [`deploy/`](deploy/) | The GPU backend ([`server/natlas_server.py`](deploy/server/natlas_server.py)), its AMD bootstrap ([`amd/`](deploy/amd/)), the Kaggle and Colab notebooks ([`colab/`](deploy/colab/)), Docker files, RunPod scripts ([`runpod/`](deploy/runpod/), never run), and [`set-backend.mjs`](deploy/set-backend.mjs) |
| [`starter-kits/`](starter-kits/) | Citizen Services, Education, Customer Service |
| [`site/`](site/) | The website: static pages plus the Worker behind the live demos |
| [`scripts/`](scripts/) | Operations and verification: [`keys.mjs`](scripts/keys.mjs), [`smoke-gateway.mjs`](scripts/smoke-gateway.mjs), [`tts-check.mjs`](scripts/tts-check.mjs), the evaluations, and [`dev/`](scripts/dev/) tools, including a clearly labelled **mock** backend for local development |
| [`docs/`](docs/) | [Integration](docs/natlas-integration.md), [technical documentation](docs/technical-documentation.md), [API reference](docs/api-reference.md), [deploy guide](docs/deploy-your-own.md), [verification record](docs/REPORT.md), [planning documents](docs/planning/) |
| [`.github/`](.github/) | CI: builds and smoke-tests the backend Docker image; builds the RunPod ASR image |

## What's been verified

**Through the public gateway and website on the AMD backend** (2026-10-04, [REPORT.md](docs/REPORT.md) sections 28–29):
- **Starter kits:** all three.
- **Chat:** in four languages.
- **Transcription:** in all four ASR languages, on real recordings.
- **Speech output:** all languages render; heard back accurately in English.
- **Keys and limits:** API key auth, per-key limits, revocation and the website's per-visitor limits.
- **GPU:** concurrent requests queue correctly.

Earlier, ASR accuracy was measured on 90 real recordings (section 8).

## Known limitations

These were measured, not estimated; details are in [REPORT.md](docs/REPORT.md#known-issues).
- **Language quality varies.** N-ATLaS's own evaluation rates Yoruba lowest (2.69/5, against 4.21 for English). Yoruba replies can lose tone marks or fall into a repetition loop (about 1 in 11 runs). The Citizen Services demo opens in Hausa for that reason.
- **Speech recognition on conversational speech is modest:** word error rates of 41% for Hausa, 56% for Yoruba and 26% for Nigerian English on small real-recording samples. 30 s per request is the reliable range.
- **Instruction following is loose:** off-topic questions sometimes get general answers, and factual slips happen. Structured prompts (`buildPrompt()`) measurably help.
- **Speech output** is accurate in English only (0–3% of words wrong when heard back). Hausa, Yoruba and Igbo are experimental.
- **Availability:** the GPU backend isn't up around the clock (see Hosting). The license cap is shared across the whole hosted service.
- **`normalizeText()` repairs but doesn't restore:** tone marks that were never typed stay missing.
- **Not yet routed back:** `reportIssue()` data has no agreed channel to the N-ATLaS maintainers yet.

## License

OpenAtlas's code is [MIT-licensed](LICENSE). The N-ATLaS models aren't part of this repository: they remain under the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS) (non-commercial, 1,000 active users per 30 days, attribution). Those terms prohibit, among other things: surveillance, discriminatory profiling, disinformation or impersonation, military use, and unauthorized personal-data scraping.
