"""Converts every clip in test-audio/eval/manifest.json to 16 kHz mono 16-bit WAV (what Whisper uses
internally), so large 48 kHz recordings fit under the gateway's upload limit without changing what
the model hears. Records each clip's measured duration and the converted file in the manifest.

Usage: python scripts/dev/resample-eval.py
"""
import json
from math import gcd
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

root = Path(__file__).resolve().parent.parent / "test-audio" / "eval"
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
for clip in manifest:
    data, sr = sf.read(root / clip["file"], dtype="float32", always_2d=True)
    mono = data.mean(axis=1)
    g = gcd(16000, sr)
    out = resample_poly(mono, 16000 // g, sr // g) if sr != 16000 else mono
    target = Path(clip["file"]).with_suffix(".16k.wav")
    sf.write(root / target, np.clip(out, -1, 1), 16000, subtype="PCM_16")
    clip["file_16k"] = target.as_posix()
    clip["measured_s"] = round(len(mono) / sr, 2)
    clip["source_rate"] = sr
(root / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
sizes = [(root / c["file_16k"]).stat().st_size for c in manifest]
print(f"{len(manifest)} clips converted; largest {max(sizes) / 1e6:.1f} MB; longest {max(c['measured_s'] for c in manifest)} s")
