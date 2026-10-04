# N-ATLaS ASR worker (RunPod Serverless)

One RunPod endpoint serving all four N-ATLaS speech-recognition models. Each is a Whisper fine-tune, and the job's `language` field picks which one runs:

| `language` | Hugging Face repo |
|---|---|
| `ha` | `NCAIR1/Hausa-ASR` |
| `yo` | `NCAIR1/Yoruba-ASR` |
| `ig` | `NCAIR1/Igbo-ASR` |
| `en-ng` | `NCAIR1/NigerianAccentedEnglish` |

Why one endpoint and not four: four endpoints would mean four separate cold starts and four idle timers for models small enough to share one GPU.

## Status

**Not yet built or deployed, and the handler hasn't run against the real models.**

What's known from the repos' config files (checked 2026-10-02; no weights downloaded):
- All four are **Whisper-small** fine-tunes (`d_model` 768, 12+12 layers), with a ~0.97 GB checkpoint each. All four together fit comfortably on a 16 GB GPU.
- Each `generation_config` sets `forced_decoder_ids: [[1, null], [2, 50359]]`. That means the language token is **auto-detected** and the task is fixed to *transcribe*. The handler follows this and forces nothing.

To check on the first real run: whether auto-detection hurts accuracy, especially for Igbo, which isn't one of base Whisper's languages, so auto-detect will label it as some other language.

## Deploy (RunPod build-from-GitHub)

1. Push this repo to GitHub.
2. RunPod console → Serverless → New Endpoint → **GitHub repo**. Set the Dockerfile path to `deploy/runpod/asr-worker/Dockerfile` and the build context to `deploy/runpod/asr-worker`.
3. Environment variables:
   - `HF_TOKEN`: a **read-only** token from an account that accepted all four repos' terms.
   - `PRELOAD_LANGUAGES` (optional, default `ha,yo,ig,en-ng`).
4. GPU: the `AMPERE_16` pool (cheapest tier, $0.58/hr on 2026-10-02). Workers: min 0, max 1, idle timeout 60 s, so it's pay-per-use only. Optionally attach a network volume so weights are cached between cold starts.
5. Put the endpoint ID into the gateway as the `ASR_ENDPOINT_ID` secret.

## Job I/O

```json
{"input": {"audio_base64": "<base64>", "language": "yo"}}
→ {"text": "...", "language": "yo", "model": "n-atlas-asr-yo", "inference_ms": <int>}
```

Payload limit: RunPod's `/run` accepts up to 10 MB, so about 7 MB of audio before base64 encoding.
