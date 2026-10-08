# N-ATLaS integration

How OpenAtlas uses the N-ATLaS models: which models, how they are loaded and served on the GPU, how a request travels from an app to a model and back, and how attribution, the license cap and rate limits are handled.
- **Source:** every statement points to the file that implements it.
- **Evidence:** every number comes from a recorded check in [`REPORT.md`](REPORT.md). Sections 28–29 cover the current AMD host.

## 0. Verifying the integration yourself

A hosted API can only *report* which model answered, so these checks go from quickest to strongest. None needs a key except step 3.

1. **Is a real backend connected?** `curl https://api.getopenatlas.xyz/v1/health`. The `backend` object comes from the GPU server's own `/health`: `reachable`, `status` (`ok` once loaded), `llm` (`true` when the N-ATLaS LLM is loaded), `asr` (the loaded ASR languages), and `mock: false` (the development mock server reports `mock: true`, and [`deploy/set-backend.mjs`](../deploy/set-backend.mjs) refuses to connect it). `reachable: false` means the GPU host is off right now; see step 4.
2. **Which models does the code load?** Open [`deploy/server/natlas_server.py`](../deploy/server/natlas_server.py), `load_models()`: `NCAIR1/N-ATLaS` with `AutoModelForCausalLM`, and the four `NCAIR1/*-ASR` repos with the ASR `pipeline`. It's the only file that loads a text-generating model. To confirm there's no other provider:
   ```bash
   git grep -n -i -E "api\.openai\.com|api\.anthropic\.com|api\.groq\.com|api\.together|api\.mistral\.ai|api\.cohere|generativelanguage\.googleapis|import (openai|anthropic)|from (openai|anthropic)|@anthropic-ai|\"openai\"|ollama" -- ':!docs/'   # no output
   ```
   (The API *shape* is OpenAI-style, `POST /v1/chat/completions`, so the word "OpenAI" appears in comments; no other provider's endpoint or client library does.)
3. **What does a response say?** With a key, every `chat()` and `transcribe()` response carries `model` (the Hugging Face ID, such as `NCAIR1/N-ATLaS` or `NCAIR1/Hausa-ASR`) and `attribution: "Powered by Awarri"`. The website's starter kits and playground show the same fields.
4. **Run it yourself.** The strongest check: start your own backend from [`deploy-your-own.md`](deploy-your-own.md) with your own Hugging Face token (the NCAIR1 repos are gated, so the download only works after you accept their terms), connect a gateway to it, and run `sdk/examples/quickstart.mjs` against it.
5. **The recorded evidence.** [`REPORT.md`](REPORT.md) logs every live check with real inputs and outputs: chat in four languages, transcription word-error rates on real recordings, GPU memory and activity while N-ATLaS generates (section 29), and the known issues. To build the integration-evidence ZIP (this document, `REPORT.md` and the source files that implement the integration, with a manifest), run `python scripts/package-evidence.py` from the repo root; it writes `dist/submission/OpenAtlas-NATLaS-Integration-Evidence.zip`.

## 1. The models

All five N-ATLaS models are used, unmodified, from their Hugging Face repositories. They are gated: the backend downloads them at start-up with a Hugging Face token, and no weights are stored in this repository.

| Model | Hugging Face ID | Used for | Precision on the live host | SDK method |
|---|---|---|---|---|
| N-ATLaS LLM (Llama-3 8B fine-tune) | `NCAIR1/N-ATLaS` | Text in English, Hausa, Yoruba, Igbo | **bf16**, no quantization | `chat()` |
| N-ATLaS ASR, Hausa (Whisper-small fine-tune) | `NCAIR1/Hausa-ASR` | Hausa speech to text | fp16 | `transcribe({ language: "ha" })` |
| N-ATLaS ASR, Yoruba | `NCAIR1/Yoruba-ASR` | Yoruba speech to text | fp16 | `transcribe({ language: "yo" })` |
| N-ATLaS ASR, Igbo | `NCAIR1/Igbo-ASR` | Igbo speech to text | fp16 | `transcribe({ language: "ig" })` |
| N-ATLaS ASR, Nigerian-accented English | `NCAIR1/NigerianAccentedEnglish` | Nigerian English speech to text | fp16 | `transcribe({ language: "en-ng" })` |

**The N-ATLaS LLM is the only model that generates text.** There is no fallback to any other language model anywhere in the stack: if N-ATLaS can't answer, the request fails with an error.

The optional speech output, `speak()`, uses **separate, non-N-ATLaS** text-to-speech models: SoroTTS, and Meta MMS-TTS. They only read out text that N-ATLaS has already written (section 7).

## 2. Where the integration lives

| Layer | File | Role |
|---|---|---|
| Model server | [`deploy/server/natlas_server.py`](../deploy/server/natlas_server.py) | Loads the five models on the GPU and serves them over HTTP. |
| Speech renderer (optional) | [`deploy/server/tts_renderer.py`](../deploy/server/tts_renderer.py) | `POST /v1/audio/speech`; plugs into the same server. |
| GPU host setup | [`deploy/amd/bootstrap.sh`](../deploy/amd/bootstrap.sh), [`deploy/amd/start.sh`](../deploy/amd/start.sh), [`deploy/amd/setup-container.sh`](../deploy/amd/setup-container.sh), [`deploy/amd/up.mjs`](../deploy/amd/up.mjs) | AMD MI300X: container setup, start, tunnel, warm-up, gateway connection. |
| Free host | [`deploy/colab/natlas_kaggle.ipynb`](../deploy/colab/natlas_kaggle.ipynb) | The same API on a free Kaggle T4 x2 (4-bit LLM there, because of 16 GB GPUs). |
| Gateway | [`gateway/src/index.ts`](../gateway/src/index.ts), [`gateway/schema.sql`](../gateway/schema.sql), [`gateway/wrangler.toml`](../gateway/wrangler.toml) | Public API: keys, license-cap counting, limits, attribution, forwarding to the backend. |
| SDK | [`sdk/src/client.ts`](../sdk/src/client.ts), [`sdk/src/types.ts`](../sdk/src/types.ts) | `@openatlas/sdk` on npm: `chat()`, `transcribe()`, `speak()`, `reportIssue()`, `normalizeText()`. |
| Apps | [`starter-kits/*/kit.mjs`](../starter-kits/), [`site/src/worker.mjs`](../site/src/worker.mjs) | Three reference apps, also running live on the website. |
| Playground | [`site/src/playground.mjs`](../site/src/playground.mjs) | `chat()`, `transcribe()` and `speak()` from the browser on a shared demo key, with input caps; shows each SDK response as-is. |
| Verification | [`scripts/smoke-gateway.mjs`](../scripts/smoke-gateway.mjs), [`scripts/tts-check.mjs`](../scripts/tts-check.mjs), [`scripts/concurrency-check.mjs`](../scripts/concurrency-check.mjs) | Real requests through the public gateway, logged in REPORT.md. |

## 3. Loading and serving on the GPU

**Live host:** one AMD Instinct MI300X (192 GB) on DigitalOcean's AMD Developer Cloud.
- **Software:** ROCm 7.14, PyTorch `2.12.0+rocm7.14.0`, `transformers` 5.18.
- **Where it runs:** the server runs inside the image's `rocm` Docker container.
- **Built on free tools first:** the whole stack was built and proven on free Kaggle T4s; moving it to AMD was a gateway configuration change.

**Loading** (`load_models()` in `natlas_server.py`, simplified: the real code also falls back to fp32 on a machine without a GPU):
```python
dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16
tok = AutoTokenizer.from_pretrained("NCAIR1/N-ATLaS", token=HF_TOKEN)
llm = AutoModelForCausalLM.from_pretrained("NCAIR1/N-ATLaS", token=HF_TOKEN, device_map="auto", dtype=dtype)
for lang in ["ha", "yo", "ig", "en-ng"]:
    asr[lang] = pipeline("automatic-speech-recognition", model=ASR_REPOS[lang], token=HF_TOKEN,
                         dtype=torch.float16, device=0)
```
- **No quantization:** the server has no quantization path, and bitsandbytes isn't installed on the host.
- **Background loading:** the models load in a background thread, while `GET /health` reports progress (`loading` → `ok`, or `error` with the reason).

**Measured on the MI300X** (REPORT.md section 29):

| What | Value |
|---|---|
| LLM load (weights cached) | 7.0 s |
| Each ASR model | 0.5–0.6 s |
| GPU memory after LLM + 4 ASR | 18.1 GB |
| GPU memory with speech models too | 25.9 GB |
| Server process VRAM (`amd-smi`) | 25.3 GB |
| GPU activity while N-ATLaS generates (`amd-smi monitor`) | 0% idle → **100%** |
| Chat, 34–60 tokens | 527–908 ms of GPU time |
| ASR, 26.7 s of Hausa speech | 644 ms of GPU time |

**One GPU job at a time.** A process-wide lock (`gpu_lock`) wraps every `generate()` and ASR call. Concurrent requests queue rather than compete for GPU memory: 6 simultaneous requests all succeeded, with wall time about equal to the sum of their compute times (REPORT.md section 28).

**Inference settings** (`POST /v1/chat/completions` in `natlas_server.py`). They were carried over from a notebook tested against the real N-ATLaS weights:
- **`repetition_penalty`:** 1.12.
- **Temperature:** 0.1 by default; greedy decoding at or below 0.01.
- **Length:** `max_new_tokens` is capped at 1,024. Prompts over 7,000 tokens are refused, since the context is about 8k.
- **Date:** today's date goes into the chat template's `date_string`. N-ATLaS's template otherwise hard-codes "Today Date: 26 Jul 2024".

**Audio handling** (`decode_audio()`, `split_audio()`):
- **Decoding:** any format ffmpeg reads (wav, mp3, ogg, flac, and the webm/m4a browsers record) is converted to 16 kHz mono float32.
- **Splitting:** audio is cut into plain 25 s pieces, with a leftover under 2 s joining the previous piece. We measured the pipeline's own `chunk_length_s` mode dropping words on 38–54 s clips (KI-11).
- **No forced language token:** each fine-tune's own generation config decides. Igbo isn't a base Whisper language, so forcing one would be wrong.

**Exposure:**
- The server listens on `127.0.0.1` inside the container. A Cloudflare quick tunnel (`cloudflared`, in the same container) is the only way in. Docker-published ports bypass the host firewall, so binding publicly would have exposed the backend directly.
- Every model route requires `Authorization: Bearer <BACKEND_API_KEY>`, checked with a constant-time comparison. That key is shared only with the gateway.

## 4. Backend HTTP contract (gateway → GPU server)

| Route | Request | Response |
|---|---|---|
| `GET /health` (no auth) | — | `{status: "loading"\|"ok"\|"error", stage, error, llm, asr: [...], load_seconds, gpu, tts?}` |
| `POST /v1/chat/completions` | `{messages, max_tokens, temperature, repetition_penalty, chat_template_kwargs}` | OpenAI shape: `{choices: [{message: {content}}], usage, model: "NCAIR1/N-ATLaS", inference_ms}` |
| `POST /v1/audio/transcriptions` | multipart (`audio` file + `language`), or JSON `{audio_base64, language}` | `{text, language, model, audio_seconds, pieces, inference_ms}` |
| `POST /v1/audio/speech` (optional) | `{text, language, engine}` | `{audio_base64 (WAV), sample_rate, seconds, engine, model, voice, sentences, warnings, latency_seconds}` |

The gateway also has a RunPod Serverless mode (`BACKEND_KIND = "runpod"`). It's scripted, but has never been run.

## 5. A request, end to end

```
app ──SDK──▶ gateway (Cloudflare Worker + D1) ──HTTPS tunnel──▶ natlas_server.py (MI300X) ──▶ N-ATLaS model
    ◀────────── {content|text, model, attribution: "Powered by Awarri"} ◀──────────────────────────────
```

1. **SDK** (`sdk/src/client.ts`):
   - checks the arguments locally: languages, a non-empty `user`, and audio size (about 7 MB at most);
   - sends `POST https://<gateway>/v1/...` with `Authorization: Bearer <OpenAtlas key>`;
   - retries network errors and `503` with backoff (1 s, 2 s);
   - never retries 4xx, 502 or 504.
2. **Gateway** (`gateway/src/index.ts`):
   1. checks the key: its SHA-256 hash must exist in `api_keys` and not be revoked;
   2. enforces the key's daily request limit;
   3. counts the end user against the license cap (section 6);
   4. adds `Respond in <language>.` to the system prompt when `language` is given;
   5. sets the inference settings above;
   6. forwards to the backend, converting a transcription into a multipart upload;
   7. maps backend failures to stable error codes: `502 backend_error`, `503 backend_unavailable`, `504 upstream_timeout` after 300 s;
   8. returns a small, fixed response with the model's Hugging Face ID and the attribution.
3. **Backend:** runs the model under the GPU lock and returns the result with its GPU time.
4. **Logging:** the gateway records `route`, `status` and `latency_ms` per key in `request_log`. Request and response content is **not** stored, except for corrections that an app explicitly sends with `reportIssue()` (section 9).

**Example** (live, REPORT.md section 29): Hausa through the public gateway and website.
```
POST /api/citizen/ask  {"question":"Ina zan je don yin rajistar katin zabe?","language":"ha"}
→ 200 in 3.5 s  {"answer":"Don yin rijistar katin zabe, ya kamata ka duba tare da Hukumar Zabe Mai Zaman Kanta ta Kasa (INEC)…","model":"NCAIR1/N-ATLaS"}
```

## 6. License compliance and rate limiting

The N-ATLaS license allows non-commercial use, by at most **1,000 active end users per 30 days**, with **"Powered by Awarri"** shown alongside model output. The gateway enforces the first two, and the API carries the third.

| Control | How it works | Where |
|---|---|---|
| End-user ID | Every model call must include `user`, a stable, opaque ID for the app's end user (400 `missing_user` otherwise). It's stored only as `sha256(keyId:user)`. | `trackActiveUser()` |
| **License cap** | Distinct hashed users seen in the last `ACTIVE_WINDOW_DAYS` (30) are counted. At `ACTIVE_USER_CAP` (1,000), **new** users get `429 license_cap_reached`; existing users continue. | `trackActiveUser()`, `active_users` table |
| Per-key share of the cap | Each key may bring at most `max_active_users` users (default 100), so one developer can't use up everyone's headroom: `429 key_user_share_reached`. | same |
| Per-key daily limit | `daily_request_limit` requests per rolling 24 h (default 1,000): `429 key_quota_exceeded`. Refused requests don't count. | `enforceDailyLimit()` |
| Key issuing and revocation | Keys are shown once and stored as SHA-256 hashes. Revocation takes effect on the next request (`401`). | `scripts/keys.mjs`, `/v1/admin/keys*` |
| Website demos | The site never trusts a browser-supplied `user`. It derives the ID from an HMAC of the visitor's network (IPv4, or IPv6 /64), with a cookie spreading shared addresses over at most 8 IDs, so made-up IDs can't use up the website key's share. There's also a per-IP limit of 10 POSTs a minute (approximate). | `site/src/worker.mjs` |

**Verified live on the MI300X backend** (REPORT.md section 29):
- no key → `401`;
- wrong key → `401`;
- second user on a one-user share → `429 key_user_share_reached`;
- fourth request on a 3/day key → `429 key_quota_exceeded`;
- revoked key → `401`;
- 10 made-up user IDs on the website → +1 user.

## 7. Attribution

- **Every response** from `chat()` and `transcribe()` carries `attribution: "Powered by Awarri"` (the constant `ATTRIBUTION` in the gateway), plus the model's Hugging Face ID (`NCAIR1/N-ATLaS`, `NCAIR1/Hausa-ASR`, …).
- **The models are named by their real IDs, not renamed.**
- **The starter kits and website** show "Powered by Awarri" next to model output.
- **The pages credit N-ATLaS** as an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, powered by Awarri Technologies.
- **Speech output** carries its own model's license credit in `attribution` (CC BY-NC-SA 4.0 for SoroTTS, CC BY-NC 4.0 for MMS-TTS), separate from N-ATLaS's.

## 8. Speech output (not N-ATLaS)

`speak()` reads out text that N-ATLaS already produced. It is a separate final-stage renderer (`tts_renderer.py`). It has no access to the N-ATLaS models, and never changes, translates or answers the text.

- **Engines:**
  - **SoroTTS** (`Shinzmann/sorotts`, an Orpheus-3B LoRA, with the SNAC decoder) handles single sentences in Hausa, Yoruba, Igbo and Pidgin.
  - **Meta MMS-TTS** handles longer text and English.
- **Quality, measured by sending the audio back through the N-ATLaS ASR models:**
  - English: 0–3% of words wrong;
  - Hausa, Yoruba, Igbo: 18–81% (KI-14).
- **So the starter kits don't use speech output, and the demo shows it in English only.** The playground offers it with the other languages labelled experimental.

## 9. Corrections back to the data (`reportIssue()`)

- **What it does:** an app can send a wrong N-ATLaS output with its correction, plus the audio for transcription errors. These are stored in `issue_reports` (with the user ID hashed), and the operator exports them with `GET /v1/admin/issues`.
- **Why:** it turns every OpenAtlas app into an opt-in source of corrected Nigerian-language data.
- **Privacy:** nothing is recorded unless the app calls it.

## 10. Reproducing it

- **Paths:** [`deploy-your-own.md`](deploy-your-own.md) stands up the same deployment:
  - AMD Developer Cloud, with one command;
  - Kaggle, for free;
  - Docker on your own GPU.
- **Checks:** with a running gateway, `node --env-file=.env scripts/smoke-gateway.mjs` sends real chat (four languages), transcription and `reportIssue()` requests, and logs the results. `scripts/tts-check.mjs` does the same for speech.
- **Record:** all past runs, with their numbers, are in [`REPORT.md`](REPORT.md).

## 11. Known limitations (from REPORT.md)

- **Yoruba is the weakest language** (KI-2, KI-3): occasional repetition loops, missing tone marks, 74% WER on our Yoruba clip.
- **ASR accuracy on conversational speech is modest:** corpus WER Hausa 41%, Yoruba 56%, Nigerian English 26% (KI-8).
- **30 s per transcription request is the reliable range** (KI-11).
- **Instruction following is loose:** off-topic questions sometimes get general answers (KI-1), and Education answers can contain factual slips (KI-10).
