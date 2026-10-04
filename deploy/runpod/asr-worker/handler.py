"""RunPod Serverless worker serving the four N-ATLaS ASR models.

One endpoint, four models: the job's `language` picks the Whisper fine-tune.

Job input:  {"audio_base64": "<base64 audio, any format ffmpeg decodes>", "language": "ha"|"yo"|"ig"|"en-ng"}
Job output: {"text": str, "language": str, "model": "n-atlas-asr-<lang>", "inference_ms": int}
            or {"error": str} for bad input.

Weights are downloaded from Hugging Face on first load (HF_TOKEN must belong to an
account that accepted each repo's terms) and cached on the network volume if one is mounted.
"""

import base64
import binascii
import os
import tempfile
import time

if os.path.isdir("/runpod-volume"):
    os.environ.setdefault("HF_HOME", "/runpod-volume/huggingface")

import runpod
import torch
from transformers import pipeline

MODELS = {
    "ha": "NCAIR1/Hausa-ASR",
    "yo": "NCAIR1/Yoruba-ASR",
    "ig": "NCAIR1/Igbo-ASR",
    "en-ng": "NCAIR1/NigerianAccentedEnglish",
}

DEVICE = 0 if torch.cuda.is_available() else -1
DTYPE = torch.float16 if torch.cuda.is_available() else torch.float32
_pipes = {}


def get_pipe(language):
    if language not in _pipes:
        started = time.time()
        _pipes[language] = pipeline(
            "automatic-speech-recognition",
            model=MODELS[language],
            token=os.environ.get("HF_TOKEN"),
            torch_dtype=DTYPE,
            device=DEVICE,
        )
        print(f"Loaded {MODELS[language]} in {time.time() - started:.1f}s", flush=True)
    return _pipes[language]


# Load at worker start so the first job doesn't pay for it. Comma-separated; empty = lazy.
for lang in filter(None, os.environ.get("PRELOAD_LANGUAGES", "ha,yo,ig,en-ng").split(",")):
    get_pipe(lang.strip())


def handler(job):
    job_input = job.get("input") or {}
    language = job_input.get("language")
    if language not in MODELS:
        return {"error": f"language must be one of {sorted(MODELS)}"}
    try:
        audio = base64.b64decode(job_input.get("audio_base64") or "", validate=True)
    except (binascii.Error, ValueError):
        return {"error": "audio_base64 is not valid base64"}
    if not audio:
        return {"error": "audio_base64 is empty"}

    # The transformers pipeline decodes files through ffmpeg, so any common format works.
    with tempfile.NamedTemporaryFile(suffix=".audio") as f:
        f.write(audio)
        f.flush()
        started = time.time()
        # No forced language token: each fine-tune's own generation_config decides.
        # Igbo is not one of base Whisper's languages, so forcing one would be wrong for at least that model.
        result = get_pipe(language)(f.name, chunk_length_s=30, batch_size=8)
    return {
        "text": result["text"].strip(),
        "language": language,
        "model": f"n-atlas-asr-{language}",
        "inference_ms": int((time.time() - started) * 1000),
    }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
