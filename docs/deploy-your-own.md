# Deploy your own OpenAtlas

OpenAtlas has two halves, and you can run both yourself:

- **Backend:** a GPU host that runs the N-ATLaS models: the LLM, four speech-recognition models, and optionally the speech renderer.
- **Gateway:** a Cloudflare Worker with a D1 database. It holds the API keys and counts active users against the N-ATLaS license cap. It also stores `reportIssue()` corrections and forwards requests to the backend.

Apps talk only to the gateway. Moving the backend to a different host is a config change on the gateway (`deploy/set-backend.mjs`), not a code change.

```
your app ── @openatlas/sdk ──▶ gateway (Cloudflare Worker + D1) ──▶ backend (GPU: N-ATLaS LLM + ASR [+ TTS])
```

## What has been run, and what hasn't

| Path | Status |
|---|---|
| **Colab backend** (`natlas_colab.ipynb`) + gateway | **Proven.** This is what has served the public OpenAtlas gateway since 2026-10-02. Every check in [`deploy/REPORT.md`](../deploy/REPORT.md) ran on it. |
| Optional speech renderer (TTS cells in the same notebook) | Built and tested with stand-in models. **Not yet verified against real models** (see REPORT.md). |
| `deploy/setup-gateway.mjs` (one-command gateway setup) | Checked with `--dry-run` only. **Not yet run against a fresh Cloudflare account.** The individual steps it runs are the ones used to set up the live gateway. |
| `deploy/server/natlas_server.py` on any other GPU host | Shares the notebook's audio handling and GPU lock. **Not verified end to end by us** on a GPU. |
| **RunPod Serverless** (`deploy/llm`, `deploy/asr`, gateway `BACKEND_KIND=runpod`) | Scripted, **never run**: no RunPod endpoint has ever been created for OpenAtlas. The ASR container image builds in CI and is publicly pullable. See the known gaps below. |

## Before you start (every path)

1. **Hugging Face:**
   - Create an account and accept the terms on [`NCAIR1/N-ATLaS`](https://huggingface.co/NCAIR1/N-ATLaS), which is gated, and on the four ASR repos (`NCAIR1/Hausa-ASR`, `NCAIR1/Yoruba-ASR`, `NCAIR1/Igbo-ASR`, `NCAIR1/NigerianAccentedEnglish`).
   - Create a **read** token.
2. **Cloudflare:**
   - The free plan is enough for the gateway.
   - Create an API token with *Workers Scripts: Edit*, *D1: Edit* and *Account Settings: Read*.
3. **This repo:** clone it, run `npm install`, then `npm run build`. You need Node 18 or later.
4. **The N-ATLaS license applies to your deployment too:**
   - non-commercial use only;
   - at most **1,000 active end users per 30 days** (your gateway enforces this);
   - "Powered by Awarri" shown wherever model output is shown.

   The optional speech models carry their own non-commercial licenses: CC BY-NC-SA 4.0 for SoroTTS, CC BY-NC 4.0 for MMS-TTS.

## Path A: Colab backend (proven)

1. Open `natlas_colab.ipynb` in [Colab](https://colab.research.google.com) (File → Upload notebook), then Runtime → Change runtime type → **T4 GPU**.
2. Add two Colab secrets (🔑 in the left sidebar), each with notebook access on:
   - `HF_TOKEN`: your Hugging Face token;
   - `NATLAS_API_KEY`: any long random string. It becomes the secret the gateway uses to reach this backend.
3. **Runtime → Run all.**
   - The models download and load: N-ATLaS in 4-bit, then the four Whisper-small ASR models. This takes several minutes; the cells print progress.
   - A smoke-test cell checks that the LLM really answers before anything is made public.
   - A Cloudflare quick tunnel then prints `NATLAS_BASE_URL` and `NATLAS_API_KEY`.
   - *Optional:* section 7b adds the speech renderer (`ENABLE_TTS = True`).
4. Set up the gateway and connect it in one command, from the repo root on your machine:
   ```bash
   CLOUDFLARE_API_TOKEN=… node deploy/setup-gateway.mjs --name my-openatlas --backend <NATLAS_BASE_URL> <NATLAS_API_KEY>
   ```
   The script:
   1. creates a D1 database and applies `gateway/schema.sql`;
   2. deploys the Worker;
   3. sets a random admin token;
   4. connects the backend;
   5. issues your first API key;
   6. writes everything to `.env.selfhost`.

   Run it with `--dry-run` first to see every step without changing anything.
5. Check it end to end with a real N-ATLaS answer:
   ```bash
   node --env-file=.env.selfhost examples/quickstart.mjs
   ```

**Kaggle instead of Colab:** `deploy/colab/natlas_kaggle.ipynb` is the same notebook with Kaggle secrets: GPU T4 x2, Internet on, and `HF_TOKEN` and `NATLAS_API_KEY` under Add-ons → Secrets. Not yet run by us.

**What to expect from Colab:**
- A free session ends when idle or after about 12 hours, and the tunnel URL changes every run.
- After a restart, run the notebook again, then reconnect the gateway: `node --env-file=.env.selfhost deploy/set-backend.mjs <new URL> <key>`. No redeploy is needed.
- It is a development and demo host, not production.

<details><summary>The gateway steps by hand (what <code>setup-gateway.mjs</code> runs)</summary>

```bash
cd gateway
npx wrangler d1 create my-openatlas-db            # put the printed id in wrangler.toml (database_id), with database_name
npx wrangler d1 execute my-openatlas-db --remote --file schema.sql
npx wrangler deploy
npx wrangler secret put ADMIN_TOKEN               # any long random string
cd ..
OPENATLAS_BASE_URL=https://<your-gateway>.workers.dev node deploy/set-backend.mjs <backend-url> <backend-key>
OPENATLAS_BASE_URL=… OPENATLAS_ADMIN_TOKEN=… node deploy/keys.mjs issue owner
```
</details>

## Path B: any GPU host (`natlas_server.py`; not verified end to end by us)

- **Hardware:** a 16 GB NVIDIA GPU is enough with the default 4-bit LLM; a T4 is fine.
- **Software:** Python 3.10+, CUDA PyTorch, and `ffmpeg` (for webm/m4a/mp3 audio).

```bash
pip install -U torch transformers accelerate bitsandbytes fastapi uvicorn python-multipart
# optional speech renderer: pip install snac peft
HF_TOKEN=… BACKEND_API_KEY=$(openssl rand -hex 24) python deploy/server/natlas_server.py
```

- **Address:** it listens on `127.0.0.1:8000`. Put HTTPS in front with a named Cloudflare Tunnel or a reverse proxy; the gateway only calls `https://` backends.
- **Connect:** `deploy/set-backend.mjs <https-url> <BACKEND_API_KEY>`.
- **Environment options** (all listed in the file's header):
  - `LLM_QUANT=none` loads the full-precision LLM, which needs about 17 GB;
  - `ASR_LANGUAGES` loads a subset of the speech-recognition models;
  - `ENABLE_TTS=1` adds the speech renderer.
- **Health:** `GET /health` reports loading progress.
- **Colab variant:** `deploy/colab/openatlas_colab.ipynb` runs this same file on Colab. It is generated by `deploy/server/build_notebook.py`.

## Path C: RunPod Serverless (documented, never run by us)

This is the persistent, pay-per-use design in the architecture document.
- **How it works:** two serverless endpoints scale to zero when idle. The gateway talks to RunPod's job API instead of an HTTP backend.
- **Not tried:** **nobody has created these endpoints for OpenAtlas yet, so treat every step below as untested.**

1. Get a RunPod account and API key, and put `RUNPOD_API_KEY` and `HF_TOKEN` in `.env`.
2. LLM endpoint:
   ```bash
   node --env-file=.env deploy/llm/deploy-llm.mjs
   ```
   - It uses RunPod's stock vLLM worker (`runpod/worker-v1-vllm:v2.27.2`), loading `NCAIR1/N-ATLaS` in fp16 on a 24 GB GPU.
   - Settings: up to 1 worker, idle timeout 60 s.
   - Set `QUANTIZATION=bitsandbytes` for 4-bit.
3. ASR endpoint:
   ```bash
   node --env-file=.env deploy/asr/deploy-asr.mjs
   ```
   - Image: `ghcr.io/benedict258/openatlas-asr:latest`, built from `workers/asr` by CI, publicly pullable.
   - GPU: a 16 GB card.
   - Both scripts save the endpoint ids to `deploy/endpoints.json`.
4. Point the gateway at RunPod:
   - set `BACKEND_KIND = "runpod"` in `gateway/wrangler.toml`;
   - `npx wrangler secret put` `RUNPOD_API_KEY`, `LLM_ENDPOINT_ID` and `ASR_ENDPOINT_ID`;
   - `npx wrangler deploy`.
5. Smoke-test: `deploy/llm/smoke-test.mjs` and `deploy/asr/smoke-test.mjs`, then `examples/quickstart.mjs` through the gateway.

**Known gaps on this path:**
- **Long audio:** the ASR worker (`workers/asr/handler.py`) still uses Whisper's built-in `chunk_length_s=30` chunking. On the Colab backend, that mode lost words on 38–54 s clips (REPORT.md, KI-11), so the backends now cut audio into plain 25 s pieces instead. Until the worker gets the same fix, keep requests to 30 s or less.
- **No speech output:** speech output is not available on the RunPod path (the gateway answers `501 tts_unsupported_backend`).
- **Cold starts:** scaling to zero means the first request after an idle minute loads the model. The gateway waits up to 300 s (`UPSTREAM_TIMEOUT_MS`).
- **Cost:** RunPod bills per second while a worker runs. The GPU tiers in the scripts were chosen as the cheapest that fit, based on prices seen on 2026-10-02; check current prices before deploying.

## Running it

- **Keys:**
  - `deploy/key-requests.mjs` reviews requests from the website form.
  - `deploy/keys.mjs` lists keys with their usage, and issues, limits and revokes them.
  - `deploy/keys.mjs report` prints per-key usage as Markdown.

  New keys get default limits from `gateway/wrangler.toml`:
  - 1,000 requests per 24 h;
  - a share of 100 active users.
- **License cap:** `GET /v1/usage` (admin token) shows active users against the 1,000 cap, per key.
- **Health:** `GET /v1/health` (public) shows whether the backend is reachable and its models are loaded.
- **Corrections:** `GET /v1/admin/issues` exports `reportIssue()` submissions.
