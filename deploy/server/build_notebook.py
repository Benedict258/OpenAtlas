"""Generate deploy/colab/openatlas_colab.ipynb from natlas_server.py, so Colab runs exactly
the server that Kaggle and the AMD host run (Colab, Kaggle or AMD). Re-run after editing the server:

    python deploy/server/build_notebook.py
"""

import json
from pathlib import Path

HERE = Path(__file__).parent
SERVER = (HERE / "natlas_server.py").read_text(encoding="utf-8")
OUT = HERE.parent / "colab" / "openatlas_colab.ipynb"


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)}


def code(text):
    return {
        "cell_type": "code",
        "metadata": {},
        "execution_count": None,
        "outputs": [],
        "source": text.strip("\n").splitlines(keepends=True),
    }


cells = [
    md(
        """
# OpenAtlas backend on Colab (INTERIM dev/test host)

Runs the N-ATLaS LLM (4-bit) and all four N-ATLaS ASR models on a free T4, behind a free Cloudflare
quick tunnel, using `deploy/server/natlas_server.py` from the OpenAtlas repo, the same server that runs on Kaggle and the AMD host.

**This is not the real deployment.** Colab disconnects when idle, ends sessions after ~12 h, and the
tunnel URL changes every run. After every (re)start, point the gateway at the new URL (last cell).

**Before you run:**
1. Runtime → Change runtime type → **T4 GPU**.
2. 🔑 Secrets (left sidebar) → add `HF_TOKEN` (the account with access to the NCAIR1 repos) → **Notebook access ON**.
   Optional: `OPENATLAS_BACKEND_KEY` (16+ random chars). If you don't set it, one is generated and printed.
3. Runtime → Run all. Loading takes several minutes (≈16 GB of weights: LLM + 4 ASR models).
4. Keep this tab open.

*N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.*
"""
    ),
    code("!nvidia-smi --query-gpu=name,memory.total --format=csv"),
    code("!pip install -q -U transformers accelerate bitsandbytes fastapi uvicorn python-multipart\n!which ffmpeg"),
    code("%%writefile natlas_server.py\n" + SERVER),
    code(
        """
import os, secrets, subprocess, time, requests
from google.colab import userdata

def secret(name):
    try:
        return userdata.get(name)
    except Exception:
        return None

HF_TOKEN = secret('HF_TOKEN')
assert HF_TOKEN, 'Add an HF_TOKEN secret (left sidebar 🔑) and enable notebook access.'
BACKEND_KEY = secret('OPENATLAS_BACKEND_KEY') or secrets.token_urlsafe(32)

env = dict(os.environ, HF_TOKEN=HF_TOKEN, BACKEND_API_KEY=BACKEND_KEY, PORT='8000', LLM_QUANT='4bit')
log = open('server.log', 'w')
server = subprocess.Popen(['python', 'natlas_server.py'], env=env, stdout=log, stderr=subprocess.STDOUT)

# Wait for all models to load, printing progress.
last = None
while True:
    time.sleep(10)
    if server.poll() is not None:
        print(open('server.log').read()[-3000:]); raise SystemExit('Server exited, see log above.')
    try:
        h = requests.get('http://127.0.0.1:8000/health', timeout=5).json()
    except Exception:
        continue
    if h['stage'] != last:
        print(time.strftime('%H:%M:%S'), h['status'], '-', h['stage']); last = h['stage']
    if h['status'] == 'error':
        print(open('server.log').read()[-3000:]); raise SystemExit(h['error'])
    if h['status'] == 'ok':
        print('Ready:', h); break
"""
    ),
    code(
        """
import re, subprocess
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
!chmod +x cloudflared
tunnel = subprocess.Popen(['./cloudflared', 'tunnel', '--url', 'http://127.0.0.1:8000'],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
BACKEND_URL = None
for line in tunnel.stdout:
    m = re.search(r'https://[a-z0-9-]+\\.trycloudflare\\.com', line)
    if m:
        BACKEND_URL = m.group(0); break
print('BACKEND_URL =', BACKEND_URL)
"""
    ),
    code(
        """
# Smoke test through the public tunnel URL: real N-ATLaS output, with timing.
import time, requests
time.sleep(5)  # give the tunnel's DNS a moment
H = {'Authorization': f'Bearer {BACKEND_KEY}'}
print(requests.get(BACKEND_URL + '/health', timeout=30).json())
t0 = time.time()
r = requests.post(BACKEND_URL + '/v1/chat/completions', headers=H, timeout=300, json={
    'messages': [{'role': 'user', 'content': 'Fassara zuwa Hausa: Where is the nearest hospital?'}], 'max_tokens': 80})
print(r.status_code, f'{time.time()-t0:.1f}s', r.json()['choices'][0]['message']['content'] if r.ok else r.text)
"""
    ),
    md(
        """
## Connect the gateway

Run this on your machine from the OpenAtlas repo root (copy the line printed below). It stores the URL
and key as Cloudflare Worker secrets and checks the gateway can reach this backend. No redeploy needed.
"""
    ),
    code("print(f'node --env-file=.env deploy/set-backend.mjs {BACKEND_URL} {BACKEND_KEY}')"),
]

nb = {
    "cells": cells,
    "metadata": {
        "accelerator": "GPU",
        "colab": {"gpuType": "T4", "provenance": []},
        "kernelspec": {"display_name": "Python 3", "name": "python3"},
        "language_info": {"name": "python"},
    },
    "nbformat": 4,
    "nbformat_minor": 0,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(nb, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT}")
