# Deploy your own OpenAtlas

**No GPU or hosting came with the challenge.** So we built and proved OpenAtlas entirely on free tools:
- **GPU:** a Kaggle notebook (2× NVIDIA T4).
- **Public HTTPS link:** a Cloudflare quick tunnel.
- **Gateway:** the Cloudflare free plan.
- **Models:** a free Hugging Face account.

**This guide is the deliverable.** Any developer, including a judge, can follow it and stand up the same working deployment we run. It costs nothing, and takes about 45 minutes, most of it waiting for models to download.

**Why the hosted demo may be offline when you visit:**
- It runs on a free Kaggle session, which stops after at most 12 hours and draws on a weekly GPU allowance.
- Each restart gets a new URL that has to be reconnected.

If the website's demos say "Backend offline", this guide is how to run it yourself.

```
your app ── @openatlas/sdk ──▶ gateway (Cloudflare Worker + D1) ──▶ tunnel ──▶ backend (GPU: N-ATLaS LLM + 4 ASR [+ speech])
```

- **Backend:** a GPU machine running the N-ATLaS models behind a small FastAPI server. A tunnel gives it a public HTTPS address.
- **Gateway:** a Cloudflare Worker with a D1 database.
  - Apps talk only to the gateway.
  - It holds the API keys, counts active users against the N-ATLaS license cap, stores `reportIssue()` corrections, and forwards each request to the backend.
  - Moving the backend is one command, `deploy/set-backend.mjs`; there's no code change and no redeploy.

## What has been run, and what hasn't

| Path | Status |
|---|---|
| **Kaggle notebook backend** (`deploy/colab/natlas_kaggle.ipynb`) | **Proven.** It runs the public OpenAtlas gateway today. The LLM, all four ASR models, the speech renderer and the three starter kits were checked live through it on 2026-10-03 (REPORT.md sections 24–26). |
| Gateway, set up step by step (Step 2b) | **Proven.** These are the steps the live gateway was built with. |
| Gateway in one command (`deploy/setup-gateway.mjs`, Step 2a) | Checked with `--dry-run` only. **Not yet run against a fresh Cloudflare account.** |
| **Docker on your own GPU** (`deploy/server/`) | **The image builds, starts, answers `/health` and refuses requests without the key, in CI** (no GPU there). **We have not run it on a GPU.** The server inside it, `natlas_server.py`, shares its audio handling and GPU lock with the notebook but has not served real requests end to end. |
| Colab notebook (`natlas_colab.ipynb`) | Ran the gateway on 2026-10-02/03, until the free Colab GPU quota ran out. The same fixes went in as for Kaggle, but **it hasn't been re-run since**. |
| RunPod Serverless (`deploy/llm`, `deploy/asr`) | Scripted, **never run.** See the end of this guide. |

## Before you start

1. **Hugging Face (free):**
   - Accept the terms on these gated repos: [`NCAIR1/N-ATLaS`](https://huggingface.co/NCAIR1/N-ATLaS), `NCAIR1/Hausa-ASR`, `NCAIR1/Yoruba-ASR`, `NCAIR1/Igbo-ASR` and `NCAIR1/NigerianAccentedEnglish`. Approval is usually instant.
   - Create a **read** token.
2. **Kaggle (free):**
   - An account that is **phone-verified**. That is required to turn on internet access, which the notebook needs to download the models.
3. **Cloudflare (free plan):**
   - An API token with *Workers Scripts: Edit*, *D1: Edit* and *Account Settings: Read*.
4. **This repository and Node 18 or later:**
   - `git clone`, then `npm install` and `npm run build` in the repo root.
5. **The N-ATLaS license applies to your deployment too:**
   - non-commercial use only;
   - at most **1,000 active end users per 30 days** (your gateway counts and enforces this);
   - "Powered by Awarri" shown wherever model output is shown.

   The optional speech models have their own non-commercial licenses: CC BY-NC-SA 4.0 for SoroTTS, CC BY-NC 4.0 for MMS-TTS.

## Step 1: Start the backend on Kaggle (exactly what we run)

1. On [kaggle.com](https://www.kaggle.com), choose **Create → New Notebook**, then **File → Import Notebook**, and upload `deploy/colab/natlas_kaggle.ipynb`.
2. Change the settings in the right-hand panel:
   - **Accelerator:** GPU T4 x2.
   - **Internet:** On.
3. Add two secrets under **Add-ons → Secrets**, and tick both so they are **attached** to this notebook:
   - `HF_TOKEN`: your Hugging Face read token.
   - `NATLAS_API_KEY`: any long random string you make up, for example from `openssl rand -hex 24`. It's the password between your gateway and this backend.
4. Click **Run all**, then wait. The first run takes roughly 10–20 minutes, mostly downloading about 25 GB of models; later runs in the same session are faster.

   At the bottom you'll see:
   ```
   NATLAS_BASE_URL = https://<random-words>.trycloudflare.com/v1
   NATLAS_API_KEY  = <your key>
   ```
5. **Leave the tab open, and don't stop or re-run cells.** The last part of the cell keeps the server running. If the tunnel ever exits, it restarts it and prints a **new** URL.

Check the backend directly, using the URL without `/v1`:
```bash
curl https://<random-words>.trycloudflare.com/health
# {"status":"ok","llm":"NCAIR1/N-ATLaS","asr_languages":["yo","ha","ig","en-ng"],"tts":{"status":"ok",...}}
```

**What the notebook does.** It has three cells:
1. instructions;
2. the speech renderer's source file;
3. one cell that runs everything below, in order.

| Part of the cell | What it does |
|---|---|
| Install | `pip install` the model and server libraries, then download `cloudflared`. ffmpeg is already on Kaggle. |
| Secrets | Reads `HF_TOKEN` and `NATLAS_API_KEY` from Kaggle Secrets, and stops with a clear message if either isn't attached. |
| N-ATLaS LLM | `NCAIR1/N-ATLaS` (Llama-3 8B) in 4-bit NF4, spread over the available GPUs. |
| ASR | The four Whisper-small fine-tunes: Hausa, Yoruba, Igbo and Nigerian English. |
| FastAPI server | Routes:<br>• `POST /v1/chat/completions`<br>• `POST /v1/audio/transcriptions`<br>• `GET /health`<br><br>Every model route requires `Authorization: Bearer <NATLAS_API_KEY>`. A single GPU lock lets only one model call run at a time.<br>Audio is decoded with ffmpeg (so browser webm/m4a works) and cut into 25-second pieces. |
| Smoke test | Calls the LLM in-process, and stops before going public if it doesn't answer. |
| Speech renderer (optional) | MMS-TTS and SoroTTS. Set `ENABLE_TTS = False` at the top of the cell to skip it. It checks that a two-sentence reply goes to the fast engine. |
| Tunnel | Starts `cloudflared tunnel --url http://localhost:8000`. It runs in its own process session and logs to `cloudflared.log`, so interrupting the notebook can't kill it, and an unread log can't block it. |
| Keep running | Checks the tunnel every minute and restarts it if it has exited. |

**Kaggle limits and what we hit:**

| What happened | What to do |
|---|---|
| A session stops after **at most 12 hours**, and GPU time counts against a weekly allowance. | Run all again when you need it, then reconnect the gateway (below). |
| `CUDA out of memory` on a second Run all. | The previous run's models were still loaded. Use **Run → Restart & clear outputs** first, then Run all. |
| The URL returned Cloudflare **530** / **1033** (tunnel offline). | Fixed in the current notebook (tunnel detached, log to a file, auto-restart). If it still happens, the cell prints a new URL; `print(open("cloudflared.log").read()[-3000:])` shows why. |
| The printed URL ends in `/v1`. | Fine: `set-backend.mjs` strips it. Use it without `/v1` for `curl`. |
| No internet in the notebook. | The account must be phone-verified, and **Internet** turned on in Settings. |

## Step 2: Set up the gateway on Cloudflare

### 2a. One command (dry-run checked only)

```bash
CLOUDFLARE_API_TOKEN=… node deploy/setup-gateway.mjs --name my-openatlas \
  --backend https://<random-words>.trycloudflare.com <NATLAS_API_KEY>
```

It does six things:
1. creates a D1 database and applies `gateway/schema.sql`;
2. deploys the Worker;
3. sets a random admin token;
4. connects your backend;
5. issues your first API key;
6. writes everything to `.env.selfhost`.

Run it with `--dry-run` first to see every step without changing anything. **We have only run it with `--dry-run`.** If it fails part-way, finish with the steps in 2b.

### 2b. Step by step (how the live gateway was built)

```bash
cd gateway
npx wrangler d1 create my-openatlas-db          # put the printed database_id (and database_name) in wrangler.toml
npx wrangler d1 execute my-openatlas-db --remote --file schema.sql
npx wrangler deploy
npx wrangler secret put ADMIN_TOKEN             # any long random string
cd ..
OPENATLAS_BASE_URL=https://<your-gateway>.workers.dev node deploy/set-backend.mjs https://<random-words>.trycloudflare.com <NATLAS_API_KEY>
OPENATLAS_BASE_URL=… OPENATLAS_ADMIN_TOKEN=… node deploy/keys.mjs issue owner
```

`set-backend.mjs` does three things:
1. checks the backend's `/health` directly, and refuses a mock backend;
2. tests the key;
3. stores the URL and key as Worker secrets, then waits until the gateway reports the backend as reachable.

**Settings in `gateway/wrangler.toml`:**
- `TTS_ENABLED`: `"true"` serves `speak()`; anything else switches it off.
- `DEFAULT_DAILY_REQUEST_LIMIT` (default 1,000) and `DEFAULT_KEY_MAX_ACTIVE_USERS` (default 100): the limits each new key gets.

## Step 3: Check it end to end

```bash
node --env-file=.env.selfhost examples/quickstart.mjs     # a real Hausa answer from N-ATLaS, with "Powered by Awarri"
curl https://<your-gateway>.workers.dev/v1/health         # backend.reachable: true, status: "ok"
node dev/fetch-test-audio.mjs && node --env-file=.env.selfhost deploy/smoke-gateway.mjs   # chat in four languages, transcribe real clips, reportIssue
```

Or use the published SDK from any project:
```bash
npm install @openatlas/sdk
OPENATLAS_API_KEY=… OPENATLAS_BASE_URL=https://<your-gateway>.workers.dev node your-app.mjs
```

The SDK is meant for **server-side** code. The gateway doesn't send CORS headers, so a browser page can't call it directly, and an API key in a browser would be visible to anyone. Put a small server in between, as the starter kits do.

## Step 4: Run the starter kits against your gateway

Each kit is a small Node server plus a page:
- Citizen Services (Q&A);
- Education (explanations by level);
- Customer Service (voice note → transcript → triage and draft reply).

Start one with:
```bash
cd starter-kits/citizen-services          # or education, customer-service
OPENATLAS_API_KEY=… OPENATLAS_BASE_URL=https://<your-gateway>.workers.dev npm start
```
Then open the URL it prints. Each kit window shows **Backend offline** or **Backend starting** when the gateway can't reach a ready backend.

## When the backend restarts

A new Kaggle session, or a restarted tunnel, gets a new URL. Reconnect it in one command; there's no redeploy:
```bash
node --env-file=.env.selfhost deploy/set-backend.mjs https://<new-words>.trycloudflare.com <NATLAS_API_KEY>
```

## Alternative backend: Docker on your own GPU

This is for any machine with an NVIDIA GPU of 16 GB or more and the NVIDIA Container Toolkit. That can be your own, or a rented GPU. Instead of a notebook, run the server in a container. It's one command, with a tunnel included:

```bash
cd deploy/server
HF_TOKEN=hf_... BACKEND_API_KEY=$(openssl rand -hex 24) docker compose up
# wait for "trycloudflare.com" in the log, then: node deploy/set-backend.mjs <that URL> <BACKEND_API_KEY>
```

- **Image:** `ghcr.io/benedict258/openatlas-backend`, built from `deploy/server/Dockerfile` by `.github/workflows/backend-image.yml` on every change. `docker compose build` builds it locally instead.
- **Weights** aren't in the image. They download at start-up into a named volume, so the second start is fast.
- **Options**, set as environment variables:
  - `ENABLE_TTS=1`: the speech renderer;
  - `LLM_QUANT=none`: full-precision LLM; needs about 17 GB of GPU memory.
  - `ASR_LANGUAGES` is listed at the top of `natlas_server.py`.
- **Fixed URL:** for one that doesn't change, replace the quick tunnel with a named Cloudflare Tunnel or a reverse proxy with HTTPS. The gateway only calls `https://` backends.
- **Without Docker:** `pip install -r deploy/server/requirements.txt` (plus CUDA PyTorch and ffmpeg), then `HF_TOKEN=… BACKEND_API_KEY=… python deploy/server/natlas_server.py`. It listens on `127.0.0.1:8000`.

**Status: not yet run on a GPU by us.**
- CI checks that the image builds, starts, answers `/health`, and refuses model calls without the key (`401`), or before the models load (`503`).
- Treat the first GPU run as a test. Watch `docker compose logs backend` and `GET /health`, which reports loading progress.

## Other paths

- **Colab** (`natlas_colab.ipynb`):
  - It was our first host, and has the same server code and fixes as the Kaggle notebook. It still has many cells, and runs best with **Run all**.
  - It uses Colab secrets (🔑 in the sidebar) instead of Kaggle Secrets.
  - A free Colab session ends when idle, and the free GPU quota runs out quickly. That's why we moved to Kaggle.
- **RunPod Serverless (never run by us):**
  - It's a scale-to-zero design: two serverless endpoints, and the gateway talks to RunPod's job API (`BACKEND_KIND = "runpod"`).
  - Scripts: `deploy/llm/deploy-llm.mjs` and `deploy/asr/deploy-asr.mjs`.
  - Known gaps:
    - its ASR worker still uses Whisper's built-in 30 s chunking, which lost words on long clips (KI-11), so keep audio to 30 s or less;
    - it has no speech output (`501 tts_unsupported_backend`);
    - cold starts take minutes;
    - it bills per second.

## Running it day to day

- **Keys:**
  - `node deploy/keys.mjs` lists keys with their limits and usage.
  - `node deploy/keys.mjs issue|limits|revoke|report` issues, limits and revokes keys, and prints a Markdown usage report.
  - `deploy/key-requests.mjs` reviews requests from a key-request form.
- **License cap:** `GET /v1/usage` (admin token) shows active users against the 1,000 cap, per key.
- **Health:** `GET /v1/health` (public) shows whether the backend is reachable and its models are loaded.
- **Corrections:** `GET /v1/admin/issues` exports `reportIssue()` submissions, with audio if you ask for it.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `503 backend_unavailable` from the gateway | The backend or tunnel is down, or the models are still loading. Check `curl <backend>/health`, then reconnect with `set-backend.mjs` if the URL changed. |
| `504 upstream_timeout` | A request took longer than the gateway's 300 s wait. A long reply or audio on a busy GPU can do this. |
| `502 backend_auth_failed` | The gateway's backend key doesn't match the backend's `NATLAS_API_KEY`. Run `set-backend.mjs` again with the right key. |
| `429 key_quota_exceeded` / `key_user_share_reached` | That key hit its daily request limit or its share of the 1,000-user cap. Raise it with `deploy/keys.mjs limits <id> --daily N --users N`. |
| Speech (`speak()`) on long Hausa/Yoruba/Igbo text is poor | Known (KI-14): the fast engine, MMS-TTS, is much less accurate in those languages than in English. |
