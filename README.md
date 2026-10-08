# OpenAtlas

**Website:** https://getopenatlas.xyz · **API:** https://api.getopenatlas.xyz · **Docs:** https://getopenatlas.xyz/docs · **SDK:** [`@openatlas/sdk` on npm](https://www.npmjs.com/package/@openatlas/sdk)

> **Non-commercial use only.** N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies. Its [Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS) allow non-commercial use only, by at most **1,000 active end users per 30 days**, and **require "Powered by Awarri" to be shown wherever N-ATLaS output is shown**. That applies to anything you build with OpenAtlas too. OpenAtlas's own code is MIT-licensed (see [License](#license)).

## 1. What is this?

**Developer infrastructure for N-ATLaS**, Nigeria's open language model and its Hausa, Yoruba, Igbo and Nigerian-English speech recognition models. Instead of loading five gated Hugging Face models on a GPU yourself, you call one SDK:

- **A TypeScript SDK on npm** (`chat()`, `transcribe()`, `normalizeText()`, `reportIssue()`, `speak()`).
- **A hosted, license-aware gateway** at `api.getopenatlas.xyz`: API keys, the 1,000-user cap, and the attribution on every response.
- **Three starter apps** (Citizen Services, Education, Customer Service), live on the website.
- **A one-command way to run the whole stack yourself**, on AMD, on a free Kaggle GPU, or with Docker.

## 2. Try it in 2 minutes

**No key, no install.** Is the hosted service up, and is a GPU backend connected?
```bash
curl https://api.getopenatlas.xyz/v1/health
```
`"backend": {"reachable": true, "status": "ok", "llm": true, "asr": ["en-ng","ha","ig","yo"], …}` means N-ATLaS is loaded and serving. Then open the **[Playground](https://getopenatlas.xyz/playground)** (chat, transcribe and speak from the browser, with no key or sign-up) or the **[starter kits](https://getopenatlas.xyz/starter-kits)**.

> The GPU backend runs on rented hardware and is not on around the clock. If health shows `"reachable": false`, the website demos and API calls return `503 backend_unavailable` until it's back; everything else in this section still works.

**With a key** ([request one here](https://getopenatlas.xyz/request-key); keys are issued by hand). Node 18+:
```bash
mkdir try-openatlas && cd try-openatlas && npm init -y && npm install @openatlas/sdk
```
```js
// try.mjs — run with: OPENATLAS_API_KEY=oa_... node try.mjs
import { OpenAtlas, normalizeText } from "@openatlas/sdk";

const client = new OpenAtlas({ apiKey: process.env.OPENATLAS_API_KEY });
const question = normalizeText("Ina zan je don yin rajistar katin zaÉ“e?", { language: "ha" }); // → "…zaɓe?" (runs locally)
const { content, model, attribution } = await client.chat({
  messages: [{ role: "user", content: question }],
  language: "ha",
  user: "your-end-user-id", // required: a stable, opaque ID for your end user (license-cap counting)
});
console.log(content);
console.log(`${model}, ${attribution}`); // NCAIR1/N-ATLaS, Powered by Awarri
```
This is [`sdk/examples/quickstart.mjs`](sdk/examples/quickstart.mjs); on 2026-10-04 it returned a Hausa answer from N-ATLaS on the AMD MI300X backend ([REPORT.md](docs/REPORT.md) section 30). Call the SDK from server-side code (a key in a browser is public). The full API is in [`docs/api-reference.md`](docs/api-reference.md).

## 3. How do I verify it's genuinely N-ATLaS?

The step-by-step checks are in **[Verifying the integration yourself](docs/natlas-integration.md#0-verifying-the-integration-yourself)**. In short:
1. **Read the file that loads the models:** [`deploy/server/natlas_server.py`](deploy/server/natlas_server.py) loads `NCAIR1/N-ATLaS` and the four `NCAIR1/*-ASR` models from Hugging Face; nothing else in the stack generates text (the optional speech renderer only reads out text N-ATLaS wrote). No other model provider's endpoint or client library appears anywhere in the code (the grep is in the linked guide).
2. **Check every response:** `chat()` and `transcribe()` return the model's Hugging Face ID (`NCAIR1/N-ATLaS`, `NCAIR1/Hausa-ASR`, …) and `"Powered by Awarri"`.
3. **Read the recorded evidence:** [`docs/REPORT.md`](docs/REPORT.md) logs every live check with real inputs, outputs and timings, including GPU activity going from 0% to 100% while N-ATLaS generates. [`docs/natlas-integration.md`](docs/natlas-integration.md) maps each claim to the file that implements it. `python scripts/package-evidence.py` builds the integration-evidence ZIP from these files.
4. **Run it yourself** (the strongest check): stand up your own backend with your own Hugging Face token, as in section 4, and point the SDK at it.

## 4. How do I self-host it?

Everything is in **[`docs/deploy-your-own.md`](docs/deploy-your-own.md)**. Three backend options, all running the same `natlas_server.py`:
- **AMD Developer Cloud (MI300X):** `node --env-file=.env deploy/amd/up.mjs <droplet-ip>`, measured at 4 min 49 s on a fresh droplet. This is how the live service runs.
- **Kaggle, free:** import [`deploy/colab/natlas_kaggle.ipynb`](deploy/colab/natlas_kaggle.ipynb) and Run all (2× T4).
- **Docker on your own NVIDIA GPU (24 GB+):** `docker compose up` in [`deploy/server/`](deploy/server/).

Then a Cloudflare Worker gateway in front of it (free plan), and point the SDK at your gateway with `OPENATLAS_BASE_URL` or `new OpenAtlas({ apiKey, baseURL })`.

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

## The website demos

- **[Playground](https://getopenatlas.xyz/playground):** call `chat()`, `transcribe()` and `speak()` from the browser, with no SDK, key or sign-up. Each response is shown exactly as the SDK returns it, next to the code that makes the same call. It runs on a shared demo key, with per-network and input limits.
- **[Starter kits](https://getopenatlas.xyz/starter-kits):** three reference apps running live against N-ATLaS:
  - **Citizen Services:** ask a civic question in Hausa, Yoruba, Igbo or English.
  - **Education:** explanations at primary or secondary level.
  - **Customer Service:** two ways in. Record a voice note, which is transcribed, triaged and given a drafted reply ("Correct this transcript" sends the fix back). Or use the text chat for a back-and-forth conversation with a support assistant.

The kits' code is in [`starter-kits/`](starter-kits/), and each runs on its own with `npm start`.

## How it's built

```
your app ── @openatlas/sdk ──▶ gateway (Cloudflare Worker + D1) ──HTTPS tunnel──▶ GPU backend (natlas_server.py)
                                · API keys (hashed), per-key limits                 · NCAIR1/N-ATLaS, bf16
                                · 1,000-user license cap (hashed user IDs)          · 4 × NCAIR1 ASR, fp16
                                · "Powered by Awarri" on every response             · optional speech renderer
```

**Hosting:**
- **Live:** the backend runs on an **AMD Instinct MI300X** (DigitalOcean AMD Developer Cloud, ROCm). That's 25 GB of GPU memory in use, with chat answered in under 1 s of GPU time (see [REPORT.md](docs/REPORT.md) section 29).
- **Starting it:** one command, `node --env-file=.env deploy/amd/up.mjs <droplet-ip>`, brings a fresh droplet to serving and reconnects the gateway.
- **Built on free tools first:** a Kaggle notebook on free T4 GPUs ([`deploy/colab/natlas_kaggle.ipynb`](deploy/colab/natlas_kaggle.ipynb)) and the Cloudflare free plan.
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
- **Starter kits:** all three, including the Customer Service text chat.
- **Playground:** chat, transcribe and speak, in a real browser at desktop and phone width.
- **Chat:** in four languages.
- **Transcription:** in all four ASR languages, on real recordings.
- **Speech output:** all languages render; heard back accurately in English.
- **Keys and limits:** API key auth, per-key limits, revocation and the website's per-visitor limits.
- **GPU:** concurrent requests queue correctly.

Earlier, ASR accuracy was measured on 90 real recordings (section 8).

**Real-world testing:** testers log each session at [`/tester`](https://getopenatlas.xyz/tester) (no names or contact details collected); `scripts/testers.mjs summary` produces the results.

## Known limitations

These were measured, not estimated; details are in [REPORT.md](docs/REPORT.md#known-issues).
- **Language quality varies.** N-ATLaS's own evaluation rates Yoruba lowest (2.69/5, against 4.21 for English). Yoruba replies can lose tone marks or fall into a repetition loop (about 1 in 11 runs). The Citizen Services demo opens in Hausa for that reason.
- **Speech recognition on conversational speech is modest:** word error rates of 41% for Hausa, 56% for Yoruba and 26% for Nigerian English on small real-recording samples. 30 s per request is the reliable range.
- **Instruction following is loose:** off-topic questions sometimes get general answers, and factual slips happen. Structured prompts (`buildPrompt()`) measurably help.
- **Speech output** is accurate in English only (0–3% of words wrong when heard back). Hausa, Yoruba and Igbo are experimental.
- **License cap:** shared across the whole hosted service.
- **`normalizeText()` repairs but doesn't restore:** tone marks that were never typed stay missing.
- **Not yet routed back:** `reportIssue()` data has no agreed channel to the N-ATLaS maintainers yet.

## License

OpenAtlas's code is [MIT-licensed](LICENSE). The N-ATLaS models aren't part of this repository: they remain under the [N-ATLaS Terms of Use](https://huggingface.co/NCAIR1/N-ATLaS) (non-commercial, 1,000 active users per 30 days, attribution).

**If you build with OpenAtlas:**
- **Non-commercial only:** N-ATLaS may not be used commercially, through OpenAtlas or otherwise.
- **Attribution is required:** show "Powered by Awarri" wherever N-ATLaS output is shown. Every API response carries it in `attribution`. The full credit line is: "N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies."

The N-ATLaS terms also prohibit, among other things: surveillance, discriminatory profiling, disinformation or impersonation, military use, and unauthorized personal-data scraping.
