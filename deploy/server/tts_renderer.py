"""OpenAtlas speech renderer (optional, separable): turns text into speech, nothing else.

It is the last step of a pipeline, after N-ATLaS has produced the text. It never reasons, translates or
transcribes: it receives only the HTTP app, the API-key check and the GPU lock, and has no access to the
N-ATLaS LLM or ASR models. Remove it by not calling install() (or deleting this file); nothing else
depends on it.

    POST /v1/audio/speech   JSON {"text", "language": en|ha|yo|ig|pcm, "engine": auto|sorotts|mms}
                            -> {"audio_base64" (WAV), "format", "sample_rate", "seconds", "engine", "model",
                                "voice", "sentences", "latency_seconds", "fallback_reason"?, "warnings"}
    GET  /health            the server's own health, plus a "tts" section

Engines:
    sorotts  Shinzmann/sorotts: a LoRA adapter on hypaai/hypaai_orpheus_v5 (Orpheus-3B) + SNAC 24 kHz
             decoder. Yoruba, Hausa, Igbo, Nigerian Pidgin. CC BY-NC-SA 4.0. Slow (autoregressive).
    mms      Meta MMS-TTS (VITS): facebook/mms-tts-{eng,hau,yor,pcm}; for Igbo, Shinzmann/soro-tts-ibo
             (an MMS-TTS fine-tune; facebook/mms-tts-ibo is not publicly available). CC BY-NC 4.0. Fast.
    auto     sorotts for a single sentence where it covers the language and is loaded; mms for longer
             text, for other languages, or if sorotts fails.

Environment (natlas_server.py): ENABLE_TTS=1 turns this on; TTS_SOROTTS=0 loads MMS only;
SOROTTS_QUANT="4bit" (default, fits next to N-ATLaS on a 16 GB T4) or "none".
"""

import base64
import io
import os
import re
import threading
import time
import traceback
import wave
from typing import Optional

import numpy as np
import torch
from fastapi import Header, HTTPException
from pydantic import BaseModel

SOROTTS_ADAPTER = "Shinzmann/sorotts"
SOROTTS_BASE = "hypaai/hypaai_orpheus_v5"
SNAC_REPO = "hubertsiuzdak/snac_24khz"
SOROTTS_VOICES = {"yo": "Yor1", "ha": "Hau1", "ig": "Ibo1", "pcm": "NaijaA"}  # the cleanest voice per language (model card)
SOROTTS_RATE = 24000
MMS_REPOS = {
    "en": "facebook/mms-tts-eng",
    "ha": "facebook/mms-tts-hau",
    "yo": "facebook/mms-tts-yor",
    "ig": "Shinzmann/soro-tts-ibo",
    "pcm": "facebook/mms-tts-pcm",
}
LANGUAGES = sorted(MMS_REPOS)
MAX_CHARS = 1000
MAX_SENTENCE_CHARS = 220
SOROTTS_MAX_NEW_TOKENS = 1200  # ~7 SNAC tokens per 12 ms frame: about 14 s of audio per sentence
SILENCE_SECONDS = 0.25
# Orpheus token scheme (must match training; from the sorotts model card).
SOH, EOT, EOH, SOS, EOS, EOAI, OFF = 128259, 128009, 128260, 128257, 128258, 128262, 128266

tts_state = {"status": "loading", "stage": "starting", "error": None, "sorotts": False, "sorotts_error": None, "mms": [], "load_seconds": {}}
_mms = {}
_so = {}
_device = "cuda" if torch.cuda.is_available() else "cpu"


def _load_sorotts(hf_token):
    from huggingface_hub import snapshot_download
    from peft import PeftModel
    from snac import SNAC
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    # The base repo ships its own adapter; load it without, then attach SoroTTS (as the model card does).
    local = snapshot_download(SOROTTS_BASE, ignore_patterns=["adapter_*", "runs/*", "training_args.bin", "handler.py"], token=hf_token)
    tok = AutoTokenizer.from_pretrained(local)
    kwargs = {"device_map": {"": 0} if _device == "cuda" else None}
    if os.environ.get("SOROTTS_QUANT", "4bit") == "4bit" and _device == "cuda":
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.float16, bnb_4bit_use_double_quant=True
        )
    else:
        kwargs["torch_dtype"] = torch.float16 if _device == "cuda" else torch.float32
    base = AutoModelForCausalLM.from_pretrained(local, **kwargs)
    model = PeftModel.from_pretrained(base, SOROTTS_ADAPTER, token=hf_token).eval()
    snac = SNAC.from_pretrained(SNAC_REPO).to(_device).eval()
    _so.update(tok=tok, model=model, snac=snac)


def load(hf_token=None, load_sorotts=True):
    try:
        from transformers import AutoTokenizer, VitsModel

        for lang, repo in MMS_REPOS.items():
            tts_state["stage"] = f"loading {repo}"
            t0 = time.time()
            _mms[lang] = (VitsModel.from_pretrained(repo, token=hf_token).to(_device).eval(), AutoTokenizer.from_pretrained(repo, token=hf_token))
            tts_state["load_seconds"][repo] = round(time.time() - t0, 1)
            tts_state["mms"] = sorted(_mms)
        if load_sorotts:
            tts_state["stage"] = f"loading {SOROTTS_ADAPTER} on {SOROTTS_BASE}"
            t0 = time.time()
            try:
                _load_sorotts(hf_token)
                tts_state["sorotts"] = True
                tts_state["load_seconds"][SOROTTS_ADAPTER] = round(time.time() - t0, 1)
            except Exception as e:  # MMS still serves every language
                _so.clear()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                tts_state["sorotts_error"] = f"{type(e).__name__}: {e}"
                traceback.print_exc()
        tts_state["status"], tts_state["stage"] = "ok", "ready"
        if torch.cuda.is_available():
            print(f"[openatlas-tts] ready. GPU memory allocated: {torch.cuda.memory_allocated() / 1e9:.1f} GB", flush=True)
    except Exception as e:
        tts_state["status"], tts_state["error"] = "error", f"{type(e).__name__}: {e}"
        traceback.print_exc()


def split_sentences(text: str):
    """One sentence per generation (sorotts has a ~15 s budget per call); long ones are cut at a comma or space."""
    out = []
    for part in re.split(r"(?<=[.!?])\s+|\n+", text.strip()):
        part = part.strip()
        while len(part) > MAX_SENTENCE_CHARS:
            cut = part.rfind(",", 0, MAX_SENTENCE_CHARS)
            if cut < 40:
                cut = part.rfind(" ", 0, MAX_SENTENCE_CHARS)
            if cut <= 0:
                cut = MAX_SENTENCE_CHARS
            out.append(part[: cut + 1].strip())
            part = part[cut + 1 :].strip()
        if part:
            out.append(part)
    return out


def _snac_decode(codes):
    clamp = lambda v: 0 if v < 0 else (4095 if v > 4095 else v)  # a stray code must not crash SNAC
    l1, l2, l3 = [], [], []
    for i in range(len(codes) // 7):
        b = 7 * i
        l1.append(clamp(codes[b]))
        l2.append(clamp(codes[b + 1] - 4096))
        l3.append(clamp(codes[b + 2] - 2 * 4096))
        l3.append(clamp(codes[b + 3] - 3 * 4096))
        l2.append(clamp(codes[b + 4] - 4 * 4096))
        l3.append(clamp(codes[b + 5] - 5 * 4096))
        l3.append(clamp(codes[b + 6] - 6 * 4096))
    if not l1:
        return np.zeros(0, dtype=np.float32)
    layers = [torch.tensor(x).unsqueeze(0).to(_device) for x in (l1, l2, l3)]
    with torch.inference_mode():
        return _so["snac"].decode(layers).squeeze().float().cpu().numpy()


def _sorotts_sentence(text: str, voice: str):
    tok, model = _so["tok"], _so["model"]
    ids = tok(f"{voice}: {text}", return_tensors="pt").input_ids
    ids = torch.cat([torch.tensor([[SOH]]), ids, torch.tensor([[EOT, EOH]])], dim=1).to(model.device)
    with torch.inference_mode():
        out = model.generate(
            input_ids=ids, attention_mask=torch.ones_like(ids), max_new_tokens=SOROTTS_MAX_NEW_TOKENS,
            do_sample=True, temperature=0.55, top_p=0.95, repetition_penalty=1.1, eos_token_id=[EOS, EOAI], use_cache=True,
        )[0]
    hit_cap = out.shape[0] - ids.shape[1] >= SOROTTS_MAX_NEW_TOKENS
    sos = (out == SOS).nonzero(as_tuple=True)[0]
    seq = out[sos[-1].item() + 1 :] if len(sos) else out[ids.shape[1] :]
    seq = seq[seq >= OFF]  # keep only SNAC audio codes
    n = (seq.size(0) // 7) * 7
    return _snac_decode([t.item() - OFF for t in seq[:n]]), hit_cap


def _mms_sentence(text: str, language: str):
    model, tok = _mms[language]
    inputs = tok(text, return_tensors="pt").to(_device)
    if inputs["input_ids"].shape[1] == 0:
        return np.zeros(0, dtype=np.float32)
    with torch.inference_mode():
        return model(**inputs).waveform[0].float().cpu().numpy()


def to_wav(samples: np.ndarray, rate: int) -> bytes:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def render(text: str, language: str, engine: str, gpu_lock):
    sentences = split_sentences(text)
    if not sentences:
        raise HTTPException(400, "text is empty")
    use = engine
    if engine == "auto":
        # sorotts renders at ~10 s per second of audio on a T4, so anything past one sentence outlasts a
        # quick tunnel's ~100 s timeout (REPORT.md section 24). auto keeps it for single sentences only.
        use = "sorotts" if tts_state["sorotts"] and language in SOROTTS_VOICES and len(sentences) == 1 else "mms"
    warnings, fallback_reason = [], None
    started = time.time()
    if use == "sorotts":
        voice = SOROTTS_VOICES[language]
        try:
            parts = []
            for s in sentences:
                with gpu_lock:  # released between sentences, so chat/ASR requests can interleave
                    audio, hit_cap = _sorotts_sentence(s, voice)
                if hit_cap:
                    warnings.append(f"sorotts reached its token limit on a sentence ({len(s)} chars); the audio may be cut off or garbled there.")
                if audio.size == 0:
                    raise RuntimeError("sorotts produced no audio codes for a sentence")
                parts.append(audio)
            rate, model, used_voice = SOROTTS_RATE, SOROTTS_ADAPTER, voice
        except Exception as e:
            if engine != "auto":
                raise HTTPException(500, f"sorotts failed: {type(e).__name__}: {e}")
            fallback_reason = f"sorotts failed: {type(e).__name__}: {e}"
            use, warnings = "mms", []
    if use == "mms":
        parts = []
        for s in sentences:
            with gpu_lock:
                audio = _mms_sentence(s, language)
            if audio.size:
                parts.append(audio)
        if not parts:
            raise HTTPException(400, "None of this text could be spoken by MMS-TTS (no characters it knows).")
        rate, model, used_voice = _mms[language][0].config.sampling_rate, MMS_REPOS[language], None
    gap = np.zeros(int(SILENCE_SECONDS * rate), dtype=np.float32)
    joined = np.concatenate([x for p in parts for x in (p, gap)][:-1])
    result = {
        "audio_base64": base64.b64encode(to_wav(joined, rate)).decode(),
        "format": "wav",
        "sample_rate": rate,
        "seconds": round(joined.size / rate, 2),
        "engine": use,
        "model": model,
        "voice": used_voice,
        "sentences": len(sentences),
        "latency_seconds": round(time.time() - started, 2),
        "warnings": warnings,
    }
    if fallback_reason:
        result["fallback_reason"] = fallback_reason
    return result


class SpeechReq(BaseModel):
    text: str
    language: str
    engine: Optional[str] = "auto"


def public_state():
    return {
        "status": tts_state["status"],
        "stage": tts_state["stage"],
        "error": tts_state["error"],
        "engines": (["sorotts"] if tts_state["sorotts"] else []) + (["mms"] if _mms else []),
        "sorotts_error": tts_state["sorotts_error"],
        "languages": LANGUAGES,
        "load_seconds": tts_state["load_seconds"],
    }


def install(app, check_key, gpu_lock, hf_token=None, load_sorotts=True, background=True):
    """Adds POST /v1/audio/speech and a "tts" section in GET /health to an existing FastAPI app, then
    loads the models (in a background thread by default). Safe to call again (e.g. re-running a cell)."""
    from fastapi.routing import APIRoute

    if not hasattr(app.state, "health_without_tts"):
        old = next((r for r in app.router.routes if isinstance(r, APIRoute) and r.path == "/health"), None)
        app.state.health_without_tts = old.endpoint if old else (lambda: {"status": "ok"})
    app.router.routes[:] = [r for r in app.router.routes if not (isinstance(r, APIRoute) and r.path in ("/health", "/v1/audio/speech"))]

    @app.get("/health")
    def health_with_tts():
        return {**app.state.health_without_tts(), "tts": public_state()}

    @app.post("/v1/audio/speech")
    def speech(req: SpeechReq, authorization: Optional[str] = Header(None)):
        # A plain def: FastAPI runs it in a worker thread, so a slow render doesn't block the server.
        check_key(authorization)
        if tts_state["status"] != "ok":
            raise HTTPException(503, f"speech renderer not ready: {tts_state['status']} ({tts_state['error'] or tts_state['stage']})")
        if req.language not in MMS_REPOS:
            raise HTTPException(400, f"language must be one of {LANGUAGES}")
        if req.engine not in ("auto", "sorotts", "mms"):
            raise HTTPException(400, "engine must be auto, sorotts or mms")
        if req.engine == "sorotts" and req.language not in SOROTTS_VOICES:
            raise HTTPException(400, f"sorotts covers {sorted(SOROTTS_VOICES)}; use engine mms or auto for {req.language}")
        if req.engine == "sorotts" and not tts_state["sorotts"]:
            raise HTTPException(503, f"sorotts is not loaded ({tts_state['sorotts_error'] or 'disabled'})")
        text = (req.text or "").strip()
        if not text:
            raise HTTPException(400, "text is empty")
        if len(text) > MAX_CHARS:
            raise HTTPException(400, f"text is limited to {MAX_CHARS} characters")
        return render(text, req.language, req.engine, gpu_lock)

    if background:
        threading.Thread(target=load, args=(hf_token, load_sorotts), daemon=True).start()
    else:
        load(hf_token, load_sorotts)
