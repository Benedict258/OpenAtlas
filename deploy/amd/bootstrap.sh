#!/usr/bin/env bash
# OpenAtlas backend on a fresh DigitalOcean AMD Developer Cloud droplet (1-Click "PyTorch on AMD Instinct",
# MI300X): from nothing to the N-ATLaS models serving behind a public tunnel URL, in one command.
# Run on the droplet as root (see docs/deploy-your-own.md, "AMD Developer Cloud"):
#
#   HF_TOKEN=hf_... BACKEND_API_KEY=<16+ random chars> [GH_TOKEN=<read-only token while the repo is private>] \
#     bash deploy/amd/bootstrap.sh
#
# or from your machine, which uploads the code instead of cloning it and connects the gateway at the end:
#
#   node --env-file=.env deploy/amd/up.mjs <droplet-ip>
#
# Safe to run again after any restart: it updates the code, skips setup that's already done, restarts the
# server and the tunnel, and prints the new tunnel URL. Optional: ENABLE_TTS=0 skips the speech renderer.
set -euo pipefail
export GIT_TERMINAL_PROMPT=0   # fail instead of prompting when the repo needs a token
REPO_URL="${REPO_URL:-https://github.com/Benedict258/OpenAtlas.git}"
CODE=/shared-docker/openatlas   # a host folder; the rocm container mounts /shared-docker at the same path
: "${HF_TOKEN:?Set HF_TOKEN to a Hugging Face read token with access to the NCAIR1 repos}"
: "${BACKEND_API_KEY:?Set BACKEND_API_KEY to a random string of 16+ characters (shared with the gateway)}"
[ "${#BACKEND_API_KEY}" -ge 16 ] || { echo "BACKEND_API_KEY must be at least 16 characters" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

step "1/5 GPU container"
docker start rocm >/dev/null
docker exec rocm python3 -c 'import torch; assert torch.cuda.is_available(), "PyTorch sees no GPU in the rocm container"; print("GPU:", torch.cuda.get_device_name(0), "| torch", torch.__version__)'

step "2/5 Code"
if [ "${OPENATLAS_CODE:-}" = "uploaded" ]; then
  echo "using the code uploaded to $CODE by deploy/amd/up.mjs"
else
  # GH_TOKEN, if set, is read by the credential helper at run time; it never appears on a command line.
  git_auth=(-c credential.helper= -c 'credential.helper=!f() { [ -n "$GH_TOKEN" ] && echo username=x-access-token && echo "password=$GH_TOKEN"; }; f')
  if [ -d "$CODE/.git" ]; then
    git -C "$CODE" "${git_auth[@]}" fetch -q --depth 1 origin main
    git -C "$CODE" reset -q --hard FETCH_HEAD
  else
    rm -rf "$CODE"
    git "${git_auth[@]}" clone -q --depth 1 "$REPO_URL" "$CODE"
  fi
  echo "at $(git -C "$CODE" log -1 --format='%h %s')"
fi

step "3/5 Packages in the container (once per container)"
docker exec rocm bash "$CODE/deploy/amd/setup-container.sh"

step "4/5 Server and tunnel"
export HF_TOKEN BACKEND_API_KEY
out=$(docker exec -e HF_TOKEN -e BACKEND_API_KEY -e ENABLE_TTS="${ENABLE_TTS:-1}" rocm bash "$CODE/deploy/amd/start.sh")
echo "$out"
url=$(printf '%s\n' "$out" | sed -n 's/^TUNNEL_URL=\(https:.*\)$/\1/p')
[ -n "$url" ] || { echo "No tunnel URL; see /shared-docker/openatlas-logs/cloudflared.log" >&2; exit 1; }

step "5/5 Loading models (the first start on a new droplet downloads roughly 30 GB), then warming up"
docker exec -i -e ENABLE_TTS="${ENABLE_TTS:-1}" -e BACKEND_API_KEY rocm python3 - <<'PY'
import io, json, os, time, urllib.request, wave
started, last = time.time(), ""
while True:
    try:
        h = json.load(urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=10))
        tts = h.get("tts") or {}
        line = f'{h["status"]} | {h["stage"]}' + (f' | speech {tts.get("status")} ({tts.get("stage")})' if tts else "")
    except Exception:
        h, tts, line = None, {}, "server starting"
    if line != last:
        print(f"{int(time.time() - started):5d}s  {line}", flush=True)
        last = line
    if h and h["status"] == "error":
        raise SystemExit(f'Loading failed: {h["error"]}. See /shared-docker/openatlas-logs/server.log')
    if h and h["status"] == "ok" and (os.environ.get("ENABLE_TTS", "1") == "0" or tts.get("status") in ("ok", "error")):
        if tts.get("status") == "error": print("  ! speech renderer failed:", tts.get("error"))
        if tts.get("sorotts_error"): print("  ! SoroTTS not loaded:", tts.get("sorotts_error"))
        break
    if time.time() - started > 2700:
        raise SystemExit("Still not loaded after 45 min. See /shared-docker/openatlas-logs/server.log")
    time.sleep(10)

# Warm-up: on ROCm the first call of each model compiles GPU kernels (11.6 s for the first MMS-TTS render,
# against ~2 s after), so one real request per model here keeps a visitor's first request from paying it.
# It also proves each model answers, not just that it loaded.
def call(path, body, multipart=None):
    headers = {"Authorization": f'Bearer {os.environ["BACKEND_API_KEY"]}'}
    if multipart:
        boundary, crlf = "openatlaswarmup", "\r\n"
        parts = []
        for name, value in multipart.items():
            filename = '; filename="a.wav"' if name == "audio" else ""
            head = f"--{boundary}{crlf}Content-Disposition: form-data; name=\"{name}\"{filename}{crlf}{crlf}"
            parts.append(head.encode() + value + crlf.encode())
        data = b"".join(parts) + f"--{boundary}--{crlf}".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    else:
        data, headers["Content-Type"] = json.dumps(body).encode(), "application/json"
    t = time.time()
    req = urllib.request.Request(f"http://127.0.0.1:8000{path}", data=data, headers=headers)
    try:
        urllib.request.urlopen(req, timeout=600).read()
        return f"{time.time() - t:5.1f}s"
    except Exception as e:
        return f"FAILED: {e}"

silence = io.BytesIO()
with wave.open(silence, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b"\0\0" * 16000)
print("  chat             ", call("/v1/chat/completions", {"messages": [{"role": "user", "content": "Say hello."}], "max_tokens": 8}), flush=True)
for lang in h["asr"]:
    print(f"  transcribe {lang:6}", call("/v1/audio/transcriptions", None, {"audio": silence.getvalue(), "language": lang.encode()}), flush=True)
if tts.get("status") == "ok":
    for lang in tts.get("languages", []):
        print(f"  speak mms {lang:7}", call("/v1/audio/speech", {"text": "Hello.", "language": lang, "engine": "mms"}), flush=True)
    if "sorotts" in tts.get("engines", []):
        print("  speak sorotts ha ", call("/v1/audio/speech", {"text": "Sannu.", "language": "ha", "engine": "sorotts"}), flush=True)
PY

cat <<EOF

Backend ready.
TUNNEL_URL=$url

Connect the gateway (on your machine, repo root):
  node --env-file=.env deploy/set-backend.mjs $url    (with NATLAS_API_KEY=<BACKEND_API_KEY> in .env)
EOF
