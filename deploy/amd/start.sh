#!/usr/bin/env bash
# Starts (or restarts) the OpenAtlas backend and its tunnel inside the `rocm` container, then prints the
# tunnel URL as TUNNEL_URL=... Run by deploy/amd-bootstrap.sh. Secrets come from the environment
# (`docker exec -e NAME`), so they never appear in a command line or on disk.
#
# The server listens on 127.0.0.1 only. The image's container publishes port 8000 to the internet, and
# Docker's published ports bypass UFW, so binding 0.0.0.0 here would expose the backend directly. The only
# way in is the cloudflared tunnel, which runs in this same container.
set -euo pipefail
: "${HF_TOKEN:?HF_TOKEN is not set}" "${BACKEND_API_KEY:?BACKEND_API_KEY is not set}"
SERVER="$(cd "$(dirname "$0")/../server" && pwd)"
LOGS=/shared-docker/openatlas-logs
CLOUDFLARED=/shared-docker/bin/cloudflared

export HOST=127.0.0.1 PORT=8000 PYTHONUNBUFFERED=1
export LLM_QUANT=none SOROTTS_QUANT=none            # bf16/fp16 throughout; bitsandbytes isn't installed
export ENABLE_TTS="${ENABLE_TTS:-1}"
export HF_HOME=/shared-docker/hf-cache              # model files on the host disk
mkdir -p "$LOGS" "$HF_HOME"

pkill -f "python3 natlas_server.py" || true
pkill -f "cloudflared tunnel" || true
sleep 2

# setsid + nohup: both keep running after this `docker exec` session ends.
cd "$SERVER"
setsid nohup python3 natlas_server.py > "$LOGS/server.log" 2>&1 < /dev/null &
: > "$LOGS/cloudflared.log"
setsid nohup "$CLOUDFLARED" tunnel --no-autoupdate --url http://127.0.0.1:8000 > "$LOGS/cloudflared.log" 2>&1 < /dev/null &

url=""
for _ in $(seq 1 60); do
  url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOGS/cloudflared.log" | head -1 || true)
  [ -n "$url" ] && break
  sleep 1
done
echo "TUNNEL_URL=${url:-none}"
