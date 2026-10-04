"""Builds the NAIC "N-ATLaS Integration Evidence" ZIP: docs/natlas-integration.md plus the source files that
implement the integration, with a MANIFEST.md mapping each file to what it shows.

Usage (repo root): python scripts/package-evidence.py
Output: dist/submission/OpenAtlas-NATLaS-Integration-Evidence.zip (dist/ is gitignored).
Refuses to build if any packaged file looks like it contains a secret.
"""
import re
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "submission" / "OpenAtlas-NATLaS-Integration-Evidence.zip"

FILES = {
    "docs/natlas-integration.md": "The integration write-up: models, loading, serving, request flow, attribution, limits.",
    "docs/REPORT.md": "Running verification record: every live check with real outputs and numbers (sections 28-29: AMD MI300X; 31: playground, text chat, tester log).",
    "deploy/server/natlas_server.py": "Loads NCAIR1/N-ATLaS (bf16) and the four NCAIR1 ASR models (fp16) on the GPU; serves them over HTTP.",
    "deploy/server/tts_renderer.py": "Optional speech output after N-ATLaS (separate, non-N-ATLaS TTS models).",
    "deploy/amd/bootstrap.sh": "Brings up the backend on the AMD MI300X droplet: GPU check, setup, start, tunnel, load, warm-up.",
    "deploy/amd/start.sh": "Starts natlas_server.py on 127.0.0.1 inside the rocm container, plus the cloudflared tunnel.",
    "deploy/amd/setup-container.sh": "One-time container setup; pins the ROCm PyTorch build; no bitsandbytes.",
    "deploy/amd/requirements.txt": "Python packages on the AMD host.",
    "deploy/amd/up.mjs": "One command from a developer machine: upload, bootstrap, connect the gateway.",
    "deploy/colab/natlas_kaggle.ipynb": "The same backend on a free Kaggle T4 x2 (the free, reproducible path).",
    "gateway/src/index.ts": "Public API: key auth, license-cap counting, per-key limits, attribution, forwarding to N-ATLaS.",
    "gateway/schema.sql": "D1 tables: hashed keys, hashed active users, request log, corrections, tester sessions.",
    "gateway/wrangler.toml": "Gateway settings: 1,000-user cap, 30-day window, per-key defaults, timeouts.",
    "sdk/src/client.ts": "@openatlas/sdk: chat(), transcribe(), speak(), reportIssue().",
    "sdk/src/types.ts": "Typed request/response shapes, including the N-ATLaS model IDs.",
    "sdk/src/errors.ts": "Typed errors and the gateway's error codes.",
    "sdk/examples/quickstart.mjs": "The README quickstart: a real Hausa answer from N-ATLaS in a few lines.",
    "starter-kits/citizen-services/kit.mjs": "Reference app: civic Q&A with chat().",
    "starter-kits/education/kit.mjs": "Reference app: explanations by level with chat().",
    "starter-kits/customer-service/kit.mjs": "Reference app: voice note -> transcribe() -> chat() triage and draft; multi-turn text chat with chat().",
    "site/src/worker.mjs": "The website's API for the live demos; server-derived end-user IDs for the license count.",
    "site/src/playground.mjs": "The browser playground: chat(), transcribe() and speak() on a shared demo key, with input caps.",
    "scripts/smoke-gateway.mjs": "Live check: chat in four languages, transcription with WER, reportIssue().",
    "scripts/tts-check.mjs": "Live check: speech output, heard back by the N-ATLaS ASR models.",
    "scripts/concurrency-check.mjs": "Live check: simultaneous requests queue on the GPU lock.",
    "scripts/support-chat-check.mjs": "Live check: the Customer Service text chat, multi-turn, in four languages.",
}

SECRET = re.compile(r"hf_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{30,}|oa_[A-Za-z0-9_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?i:bearer)\s+[A-Za-z0-9_\-]{32,}")


def main():
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(["git", "status", "--porcelain", "--", *FILES], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    missing = [f for f in FILES if not (ROOT / f).is_file()]
    if missing:
        raise SystemExit(f"Missing files: {missing}")
    for f in FILES:
        hit = SECRET.search((ROOT / f).read_text(encoding="utf-8"))
        if hit:
            raise SystemExit(f"Refusing to package: {f} contains something that looks like a secret ({hit.group(0)[:12]}…)")

    manifest = [
        "# OpenAtlas: N-ATLaS Integration Evidence",
        "",
        f"Built {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC} from commit `{commit}`"
        + (" (with uncommitted changes in some of these files)" if dirty else "") + ".",
        "",
        "Start with `docs/natlas-integration.md`. Each file below is copied from the repository at the same path.",
        "",
        "| File | What it shows |",
        "|---|---|",
        *[f"| `{f}` | {why} |" for f, why in FILES.items()],
        "",
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("OpenAtlas-NATLaS-Integration-Evidence/MANIFEST.md", "\n".join(manifest))
        for f in FILES:
            z.write(ROOT / f, f"OpenAtlas-NATLaS-Integration-Evidence/{f}")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB, {len(FILES) + 1} files, commit {commit}{', dirty' if dirty else ''})")


if __name__ == "__main__":
    main()
