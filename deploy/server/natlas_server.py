"""OpenAtlas backend server: N-ATLaS LLM + the four N-ATLaS ASR models behind one HTTP API.

Implements the backend contract the OpenAtlas gateway calls when BACKEND_KIND=http
(OpenAtlas_Architecture_DevPlan.md §3.3). The same file runs on the AMD MI300X host (deploy/amd), in
Docker on any NVIDIA GPU, or by hand, so moving hosts is a gateway config change only.

    GET  /health                    -> {"status": "ok"|"loading"|"error", "llm": bool, "asr": [...], ...}
    POST /v1/chat/completions       OpenAI-style request/response
    POST /v1/audio/transcriptions   multipart (audio file + language), or JSON {"audio_base64", "language"}
                                    -> {"text", "language", "model", "inference_ms"}

Every route except /health requires `Authorization: Bearer $BACKEND_API_KEY`.

Environment:
    HF_TOKEN          Hugging Face token with access to the five NCAIR1 repos (required)
    BACKEND_API_KEY   shared secret with the gateway, 16+ chars (required)
    PORT              default 8000
    HOST              default 127.0.0.1 (put a tunnel or reverse proxy in front for HTTPS)
    ASR_LANGUAGES     comma-separated subset of ha,yo,ig,en-ng to load (default: all four)
    ENABLE_TTS        "1" adds the optional speech renderer (tts_renderer.py, POST /v1/audio/speech),
                      loaded after the N-ATLaS models. Off by default. TTS_SOROTTS=0 loads MMS-TTS only.

Inference settings carried over from the Safroi Colab notebook, which ran against the real
N-ATLaS weights: repetition penalty 1.12, current date passed into the chat template's
`date_string` (it otherwise says "26 Jul 2024"), 4-bit NF4 quantization on small GPUs.

N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital
Economy, and powered by Awarri Technologies.
"""

import base64
import binascii
import hmac
import os
import tempfile
import threading
import time
import traceback
import uuid
from datetime import datetime
from typing import Dict, List, Optional

import torch
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel

LLM_REPO = "NCAIR1/N-ATLaS"
ASR_REPOS = {
    "ha": "NCAIR1/Hausa-ASR",
    "yo": "NCAIR1/Yoruba-ASR",
    "ig": "NCAIR1/Igbo-ASR",
    "en-ng": "NCAIR1/NigerianAccentedEnglish",
}
MAX_INPUT_TOKENS = 7000  # context is ~8k; leave room for the answer

HF_TOKEN = os.environ.get("HF_TOKEN")
API_KEY = os.environ.get("BACKEND_API_KEY", "")
# No quantization: the LLM loads in bf16 (fp16 where bf16 isn't supported) and needs ~16 GB, which the AMD
# MI300X host has many times over. bitsandbytes is not used by this server at all (it is the riskiest
# package on ROCm). The speech renderer is told the same, since it also supports 4-bit for the Kaggle T4.
os.environ["SOROTTS_QUANT"] = "none"
ASR_TO_LOAD = [l.strip() for l in os.environ.get("ASR_LANGUAGES", ",".join(ASR_REPOS)).split(",") if l.strip()]

state = {"status": "loading", "stage": "starting", "error": None, "load_seconds": {}}
tok = None
llm = None
asr: Dict[str, object] = {}
gpu_lock = threading.Lock()  # one forward pass at a time on a single GPU


def load_models():
    global tok, llm
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

        dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16
        state["stage"] = f"loading {LLM_REPO} ({str(dtype).replace('torch.', '')})"
        t0 = time.time()
        tok = AutoTokenizer.from_pretrained(LLM_REPO, token=HF_TOKEN)
        llm = AutoModelForCausalLM.from_pretrained(LLM_REPO, token=HF_TOKEN, device_map="auto", dtype=dtype)
        llm.eval()
        state["load_seconds"]["llm"] = round(time.time() - t0, 1)
        print(f"[openatlas] LLM loaded in {state['load_seconds']['llm']}s", flush=True)

        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        device = 0 if torch.cuda.is_available() else -1
        for lang in ASR_TO_LOAD:
            state["stage"] = f"loading {ASR_REPOS[lang]}"
            t0 = time.time()
            asr[lang] = pipeline(
                "automatic-speech-recognition", model=ASR_REPOS[lang], token=HF_TOKEN, dtype=dtype, device=device
            )
            state["load_seconds"][lang] = round(time.time() - t0, 1)
            print(f"[openatlas] {ASR_REPOS[lang]} loaded in {state['load_seconds'][lang]}s", flush=True)

        state["status"], state["stage"] = "ok", "ready"
        if torch.cuda.is_available():
            print(f"[openatlas] ready. GPU memory allocated: {torch.cuda.memory_allocated() / 1e9:.1f} GB", flush=True)
    except Exception as e:  # surfaced through /health instead of killing the process
        state["status"], state["error"] = "error", f"{type(e).__name__}: {e}"
        traceback.print_exc()


app = FastAPI(title="OpenAtlas backend")


def check_auth(authorization: Optional[str]):
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {API_KEY}"):
        raise HTTPException(401, "Unauthorized")


def require_ready(what: str):
    if state["status"] != "ok":
        raise HTTPException(503, f"{what} not ready: {state['status']} ({state['error'] or state['stage']})")


@app.get("/health")
def health():
    return {
        "status": state["status"],
        "stage": state["stage"],
        "error": state["error"],
        "llm": llm is not None,
        "asr": sorted(asr),
        "load_seconds": state["load_seconds"],
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


class Msg(BaseModel):
    role: str
    content: str


class ChatReq(BaseModel):
    model: Optional[str] = None
    messages: List[Msg]
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.1
    repetition_penalty: Optional[float] = 1.12
    chat_template_kwargs: Optional[dict] = None


@app.post("/v1/chat/completions")
def chat(req: ChatReq, authorization: Optional[str] = Header(None)):
    check_auth(authorization)
    require_ready("LLM")
    template_kwargs = {"date_string": datetime.now().strftime("%d %b %Y"), **(req.chat_template_kwargs or {})}
    text = tok.apply_chat_template(
        [m.model_dump() for m in req.messages], add_generation_prompt=True, tokenize=False, **template_kwargs
    )
    inputs = tok(text, return_tensors="pt", add_special_tokens=False).to(llm.device)
    n_in = inputs["input_ids"].shape[1]
    if n_in > MAX_INPUT_TOKENS:
        raise HTTPException(400, f"Input too long ({n_in} tokens, max {MAX_INPUT_TOKENS}).")
    temp = req.temperature or 0
    gen = dict(
        max_new_tokens=min(req.max_tokens or 512, 1024),
        repetition_penalty=req.repetition_penalty or 1.12,
        use_cache=True,
        pad_token_id=tok.eos_token_id,
    )
    gen.update(dict(do_sample=True, temperature=temp) if temp > 0.01 else dict(do_sample=False))
    started = time.time()
    with gpu_lock, torch.inference_mode():
        out = llm.generate(**inputs, **gen)
    new = out[0][n_in:]
    answer = tok.decode(new, skip_special_tokens=True).strip()
    return {
        "id": "chatcmpl-" + uuid.uuid4().hex,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": LLM_REPO,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": answer}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": n_in, "completion_tokens": len(new), "total_tokens": n_in + len(new)},
        "inference_ms": int((time.time() - started) * 1000),
    }


@app.post("/v1/audio/transcriptions")
async def transcribe(request: Request, authorization: Optional[str] = Header(None)):
    check_auth(authorization)
    # The gateway sends multipart (fields `audio`, `language`); JSON {audio_base64, language} also works.
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        upload, language = form.get("audio"), form.get("language")
        audio = await upload.read() if hasattr(upload, "read") else b""
    else:
        try:
            body = await request.json()
            language = body.get("language")
            audio = base64.b64decode(body.get("audio_base64") or "", validate=True)
        except (binascii.Error, ValueError, AttributeError):
            raise HTTPException(400, "Send multipart (audio, language) or JSON with valid audio_base64 and language")
    if language not in ASR_REPOS:
        raise HTTPException(400, f"language must be one of {sorted(ASR_REPOS)}")
    require_ready("ASR")
    if language not in asr:
        raise HTTPException(503, f"ASR model for {language} is not loaded on this backend (ASR_LANGUAGES).")
    if not audio:
        raise HTTPException(400, "audio is empty")
    return await run_in_threadpool(run_asr, audio, language)


SAMPLE_RATE = 16000   # what the Whisper models use
PIECE_SECONDS = 25    # long audio is cut into plain pieces of this length (deploy/REPORT.md, KI-11)


def decode_audio(audio: bytes):
    """Any format ffmpeg reads (wav, mp3, ogg, flac, webm, m4a) -> 16 kHz mono float32."""
    import numpy as np
    import subprocess

    with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as f:
        f.write(audio)
        path = f.name
    try:
        out = subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"],
            capture_output=True, check=True,
        ).stdout
    except subprocess.CalledProcessError as e:
        raise HTTPException(400, f"Could not decode this audio: {e.stderr.decode(errors='replace')[:300]}")
    finally:
        os.unlink(path)
    return np.frombuffer(out, dtype=np.float32)


def split_audio(samples):
    """Plain, non-overlapping PIECE_SECONDS pieces. The pipeline's chunked mode (chunk_length_s) was measured
    dropping speech on 38-54 s clips; plain pieces did not. A leftover under 2 s joins the previous piece."""
    import numpy as np

    step = PIECE_SECONDS * SAMPLE_RATE
    pieces = [samples[i:i + step] for i in range(0, len(samples), step)]
    if len(pieces) > 1 and len(pieces[-1]) < 2 * SAMPLE_RATE:
        leftover = pieces.pop()
        pieces[-1] = np.concatenate([pieces[-1], leftover])
    return pieces


def run_asr(audio: bytes, language: str):
    samples = decode_audio(audio)
    if samples.size == 0:
        raise HTTPException(400, "audio is empty")
    pieces = split_audio(samples)
    started = time.time()
    try:
        with gpu_lock:
            # No forced language token: each fine-tune's own generation_config decides
            # (Igbo isn't a base Whisper language, so forcing one would be wrong there).
            texts = [asr[language]({"array": p, "sampling_rate": SAMPLE_RATE})["text"].strip() for p in pieces]
    except Exception as e:
        raise HTTPException(400, f"Could not transcribe this audio: {type(e).__name__}: {e}")
    return {
        "text": " ".join(t for t in texts if t),
        "language": language,
        "model": f"n-atlas-asr-{language}",
        "audio_seconds": round(samples.size / SAMPLE_RATE, 2),
        "pieces": len(pieces),
        "inference_ms": int((time.time() - started) * 1000),
    }


def load_all():
    load_models()
    if os.environ.get("ENABLE_TTS") == "1":
        import tts_renderer  # optional final-stage speech renderer; see its docstring

        tts_renderer.install(app, check_auth, gpu_lock, HF_TOKEN, load_sorotts=os.environ.get("TTS_SOROTTS", "1") != "0", background=False)


if __name__ == "__main__":
    if not HF_TOKEN:
        raise SystemExit("Set HF_TOKEN (account with access to the NCAIR1 N-ATLaS repos).")
    if len(API_KEY) < 16:
        raise SystemExit("Set BACKEND_API_KEY to a random string of 16+ characters (shared with the gateway).")
    unknown = [l for l in ASR_TO_LOAD if l not in ASR_REPOS]
    if unknown:
        raise SystemExit(f"Unknown ASR_LANGUAGES {unknown}; use a subset of {sorted(ASR_REPOS)}.")
    threading.Thread(target=load_all, daemon=True).start()
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")), log_level="warning")
