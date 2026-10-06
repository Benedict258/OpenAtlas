# Deploy your own OpenAtlas

## How OpenAtlas was built

- **GPU:** a Kaggle notebook (2× NVIDIA T4).
- **Public HTTPS link:** a Cloudflare quick tunnel.
- **Gateway:** the Cloudflare free plan.
- **Models:** a free Hugging Face account.

**The live demo runs on an AMD Instinct MI300X** on DigitalOcean's AMD Developer Cloud. The architecture is the same: the same server code, tunnel and gateway. Only the GPU host changes.

**This guide is the deliverable.** Any developer can follow it and stand up the same working deployment:
- **AMD Developer Cloud,** if you have GPU credit: one command, about 3 minutes.
- **Kaggle,** free: about 45 minutes, mostly model downloads.
- **Docker,** on your own GPU.

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
| **AMD Developer Cloud, MI300X** (`deploy/amd/bootstrap.sh`, `deploy/amd/up.mjs`) | **Proven; this is the live host.** On 2026-10-04 everything was checked through it (REPORT.md section 28): the LLM, all four ASR models and the speech renderer, all in bf16/fp16 with no quantization; the three starter kits; API key auth and limits. Restarts on the same droplet were tested. **Not yet run on a freshly created droplet:** that path is scripted, but untried end to end. |
| **Kaggle notebook backend** (`deploy/colab/natlas_kaggle.ipynb`) | **Proven; the free path.** It ran the public gateway on 2026-10-03, where the LLM, all four ASR models, the speech renderer and the three starter kits were checked live (REPORT.md sections 24–26). |
| Gateway, set up step by step (Step 2b) | **Proven.** These are the steps the live gateway was built with. |
| Gateway in one command (`deploy/setup-gateway.mjs`, Step 2a) | Checked with `--dry-run` only. **Not yet run against a fresh Cloudflare account.** |
| **Docker on your own GPU** (`deploy/server/`) | **The image builds, starts, answers `/health` and refuses requests without the key, in CI** (no GPU there). **The image itself has not been run on a GPU.** The server inside it, `natlas_server.py`, is the same file that serves the live AMD host. |
| Colab notebook (`deploy/colab/natlas_colab.ipynb`) | Ran the gateway on 2026-10-02/03, until the free Colab GPU quota ran out. The same fixes went in as for Kaggle, but **it hasn't been re-run since**. |
| RunPod Serverless (`deploy/runpod/llm`, `deploy/runpod/asr`) | Scripted, **never run.** See the end of this guide. |

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

## AMD Developer Cloud (the live host)

This is how the live demo runs. It needs DigitalOcean / AMD Developer Cloud GPU credit, and it's billed by the hour while the droplet exists: powering it off doesn't stop the billing, only destroying it does. Each new start gets a new tunnel URL, which `deploy/amd/up.mjs` reconnects to the gateway.

**Set up your gateway first** (Step 2 below), because the last step here connects it. The rest takes about 3 minutes on a new droplet once you've done it before: the scripts handle setup, model download, warm-up and the gateway connection.

### Once: an SSH key

1. On your machine, check for a key with `ls ~/.ssh/id_ed25519.pub` (Windows: `C:\Users\<you>\.ssh\id_ed25519.pub`). If there isn't one, run `ssh-keygen -t ed25519` and press Enter through the prompts.
2. In the DigitalOcean control panel, add the **public** key: the contents of `id_ed25519.pub`, a single line starting `ssh-ed25519`. Go to **Settings → Security → SSH Keys → Add SSH Key**. Once added there, every new droplet can include it.

### Each time: create the droplet

1. **Create → GPU Droplets.**
2. **GPU:** AMD Instinct **MI300X**, a single GPU (192 GB).
3. **Image:** the 1-Click **"PyTorch on AMD Instinct"**: Ubuntu 24.04 with ROCm 7.14, and PyTorch 2.12 inside a Docker container named `rocm`, which starts automatically.
4. **Authentication:** **SSH Key**, with your key **ticked**. Without it, you can't log in as root non-interactively, and the scripts can't connect.
5. Create it, then copy its **public IPv4 address**. You can run `up.mjs` straight away: it waits for the droplet's first boot to finish (about 90 s, while the image creates its `rocm` container) before uploading anything.
6. Check that you can log in: `ssh root@<ip> docker ps` should list a container named `rocm`.

   **If SSH says `REMOTE HOST IDENTIFICATION HAS CHANGED`:** a new droplet reused an address you've connected to before. Remove the old entry with `ssh-keygen -R <ip>` and try again. `up.mjs` trusts a new droplet's host key the first time it connects, and checks it after that.

### Each time: start OpenAtlas on it (one command, from your machine)

`.env` needs `HF_TOKEN`, `NATLAS_API_KEY` (16+ random characters: the backend's key), `OPENATLAS_BASE_URL` and `CLOUDFLARE_API_TOKEN` (from Step 2). Then:

```bash
node --env-file=.env deploy/amd/up.mjs <droplet-ip>
```

It does two things. First it uploads this checkout's server code and runs `deploy/amd/bootstrap.sh` on the droplet, which:
1. checks that the GPU is visible inside the `rocm` container;
2. installs ffmpeg, the Python packages and `cloudflared` in the container. This happens once per droplet. The image's ROCm build of PyTorch is pinned, so pip can't replace it, and bitsandbytes isn't installed.
3. starts the server and a Cloudflare quick tunnel, both detached;
4. waits for the models to load in bf16/fp16, about 30 GB on a new droplet;
5. warms up every model with one real request each.

Then it connects your gateway to the new tunnel URL, with `deploy/set-backend.mjs`.

**Measured:** on a freshly created droplet (2026-10-06), **4 minutes 49 seconds** from the command to the gateway serving, including the package install, the ~30 GB model download (models loaded in 90 s) and the warm-up (REPORT.md section 32). On a droplet that's already set up, about 2.5 minutes.

**Without your machine,** log in to the droplet and run the same script there. It clones the repo, which needs a read-only `GH_TOKEN` while the repo is private:
```bash
git clone https://github.com/Benedict258/OpenAtlas.git /tmp/oa   # or: curl/scp just deploy/amd/bootstrap.sh
HF_TOKEN=hf_... BACKEND_API_KEY=... [GH_TOKEN=...] bash /tmp/oa/deploy/amd/bootstrap.sh
```
It prints `TUNNEL_URL=...` and the exact `set-backend.mjs` command to run on your machine.

**Where things live on the droplet:**
- **Code:** `/shared-docker/openatlas`.
- **Model files:** `/shared-docker/hf-cache`.
- **Logs:** `/shared-docker/openatlas-logs/server.log` and `cloudflared.log`.

`/shared-docker` is a host folder that the `rocm` container mounts.

**Security:**
- **The server listens on 127.0.0.1 only, inside the container.** The image publishes the container's ports 8000, 8888 and 30000 to the internet, and Docker-published ports bypass the UFW firewall. So the tunnel is the only way in. We checked from outside that port 8000 doesn't answer.
- **Port 8888 is the image's JupyterLab,** which is reachable from the internet but needs its login token.
- **Secrets** go from your machine to the container as environment variables over SSH. They're never written to the droplet's disk.

### When you're done: destroy it

**Powering a droplet off does not stop the billing. Only destroying it does.** Choose **Destroy** on the droplet's page. Next time, create a new one and run `up.mjs` again; the steps above are all there is to it.

### ROCm notes (measured on this host, 2026-10-04)

**The good:**
- Everything in OpenAtlas runs on ROCm unchanged: the LLM and the four ASR models in bf16/fp16, MMS-TTS, and SoroTTS in fp16.
- No HIP errors appeared, and no ROCm warnings in the server log.

**Chat and ASR are fast:**
- Chat: 0.4–3 s, against 4–8 s on Kaggle.
- ASR: 27 s of audio in 0.7 s of GPU time.

**MMS-TTS is slower than on a T4:** about 2 s per short sentence against 0.3 s, after a first-call warm-up of about 11 s. SoroTTS is about 3× faster than on a T4, at 2.8 s per second of audio, but still slower than real time.

**One CPU thread is always at 100%:**
- The ROCm runtime's event loop (`rocr::core::Runtime::AsyncEventsLoop`) busy-polls.
- This is the runtime's default behaviour on this virtual-function GPU; nothing in the image sets it.
- It uses 1 of the 20 vCPUs and doesn't affect results.

**The first call of each model is slower:** 8 s for the first chat, 7–12 s for the first MMS render. That's why the bootstrap warms each model up before reporting ready.

## Step 1: Start the backend on Kaggle (free)

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
OPENATLAS_BASE_URL=https://<your-gateway>.workers.dev NATLAS_API_KEY=… node deploy/set-backend.mjs https://<random-words>.trycloudflare.com
OPENATLAS_BASE_URL=… OPENATLAS_ADMIN_TOKEN=… node scripts/keys.mjs issue owner
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
node --env-file=.env.selfhost sdk/examples/quickstart.mjs     # a real Hausa answer from N-ATLaS, with "Powered by Awarri"
curl https://<your-gateway>.workers.dev/v1/health         # backend.reachable: true, status: "ok"
node scripts/dev/fetch-test-audio.mjs && node --env-file=.env.selfhost scripts/smoke-gateway.mjs   # chat in four languages, transcribe real clips, reportIssue
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

A new droplet or Kaggle session, or a restarted tunnel, gets a new URL. Reconnect it in one command; there's no redeploy:
```bash
node --env-file=.env deploy/amd/up.mjs <droplet-ip>        # AMD: restarts everything and reconnects
node --env-file=.env deploy/set-backend.mjs https://<new-words>.trycloudflare.com    # any host
```
`set-backend.mjs` reads the backend's key from `NATLAS_API_KEY` in `.env`, so it never appears on a command line. Passing it as a second argument still works.

## Alternative backend: Docker on your own GPU

This is for any machine with an NVIDIA GPU of 24 GB or more and the NVIDIA Container Toolkit. The server loads every model unquantized, so a 16 GB card such as a T4 is too small; use the Kaggle notebook there. That can be your own, or a rented GPU. Instead of a notebook, run the server in a container. It's one command, with a tunnel included:

```bash
cd deploy/server
HF_TOKEN=hf_... BACKEND_API_KEY=$(openssl rand -hex 24) docker compose up
# wait for "trycloudflare.com" in the log, then (with NATLAS_API_KEY=<BACKEND_API_KEY> in .env):
# node --env-file=.env deploy/set-backend.mjs <that URL>
```

- **Image:** `ghcr.io/benedict258/openatlas-backend`, built from `deploy/server/Dockerfile` by `.github/workflows/backend-image.yml` on every change. `docker compose build` builds it locally instead.
- **Weights** aren't in the image. They download at start-up into a named volume, so the second start is fast.
- **Options**, set as environment variables:
  - `ENABLE_TTS=1`: the speech renderer;
  - `ASR_LANGUAGES` is listed at the top of `natlas_server.py`.
- **Fixed URL:** for one that doesn't change, replace the quick tunnel with a named Cloudflare Tunnel or a reverse proxy with HTTPS. The gateway only calls `https://` backends.
- **Without Docker:** `pip install -r deploy/server/requirements.txt` (plus CUDA PyTorch and ffmpeg), then `HF_TOKEN=… BACKEND_API_KEY=… python deploy/server/natlas_server.py`. It listens on `127.0.0.1:8000`.

**Status: not yet run on a GPU by us.**
- CI checks that the image builds, starts, answers `/health`, and refuses model calls without the key (`401`), or before the models load (`503`).
- Treat the first GPU run as a test. Watch `docker compose logs backend` and `GET /health`, which reports loading progress.

## Other paths

- **Colab** (`deploy/colab/natlas_colab.ipynb`):
  - It was our first host, and has the same server code and fixes as the Kaggle notebook. It still has many cells, and runs best with **Run all**.
  - It uses Colab secrets (🔑 in the sidebar) instead of Kaggle Secrets.
  - A free Colab session ends when idle, and the free GPU quota runs out quickly. That's why we moved to Kaggle.
- **RunPod Serverless (never run by us):**
  - It's a scale-to-zero design: two serverless endpoints, and the gateway talks to RunPod's job API (`BACKEND_KIND = "runpod"`).
  - Scripts: `deploy/runpod/llm/deploy-llm.mjs` and `deploy/runpod/asr/deploy-asr.mjs`.
  - Known gaps:
    - its ASR worker still uses Whisper's built-in 30 s chunking, which lost words on long clips (KI-11), so keep audio to 30 s or less;
    - it has no speech output (`501 tts_unsupported_backend`);
    - cold starts take minutes;
    - it bills per second.

## Running it day to day

- **Keys:**
  - `node scripts/keys.mjs` lists keys with their limits and usage.
  - `node scripts/keys.mjs issue|limits|revoke|report` issues, limits and revokes keys, and prints a Markdown usage report.
  - `scripts/key-requests.mjs` reviews requests from a key-request form.
- **License cap:** `GET /v1/usage` (admin token) shows active users against the 1,000 cap, per key.
- **Health:** `GET /v1/health` (public) shows whether the backend is reachable and its models are loaded.
- **Corrections:** `GET /v1/admin/issues` exports `reportIssue()` submissions, with audio if you ask for it.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `503 backend_unavailable` from the gateway | The backend or tunnel is down, or the models are still loading. Check `curl <backend>/health`, then reconnect with `set-backend.mjs` if the URL changed. |
| `504 upstream_timeout` | A request took longer than the gateway's 300 s wait. A long reply or audio on a busy GPU can do this. |
| `502 backend_auth_failed` | The gateway's backend key doesn't match the backend's `NATLAS_API_KEY`. Run `set-backend.mjs` again with the right key. |
| `429 key_quota_exceeded` / `key_user_share_reached` | That key hit its daily request limit or its share of the 1,000-user cap. Raise it with `scripts/keys.mjs limits <id> --daily N --users N`. |
| Speech (`speak()`) on long Hausa/Yoruba/Igbo text is poor | Known (KI-14): the fast engine, MMS-TTS, is much less accurate in those languages than in English. |
