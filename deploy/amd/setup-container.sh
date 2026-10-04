#!/usr/bin/env bash
# One-time setup inside the `rocm` container of DigitalOcean's "PyTorch on AMD Instinct" image (MI300X):
# ffmpeg, the Python packages, cloudflared. Run by deploy/amd-bootstrap.sh; skips itself once done in this
# container (a new droplet has a new container, so it runs again there).
set -euo pipefail
MARKER=/root/.openatlas-setup-done   # inside the container, not on the shared host folder
if [ -f "$MARKER" ] && [ "${FORCE_SETUP:-0}" != "1" ]; then
  echo "already set up in this container (FORCE_SETUP=1 to redo)"
  exit 0
fi
cd "$(dirname "$0")"

# Pin the image's ROCm torch: without this, a dependency could pull a CUDA torch from PyPI over it.
python3 -c 'import torch; print(f"torch=={torch.__version__}")' > /tmp/openatlas-torch-pin.txt
echo "keeping $(cat /tmp/openatlas-torch-pin.txt)"

# ffmpeg decodes the audio formats browsers record (webm, m4a) as well as wav/mp3/ogg/flac.
if ! command -v ffmpeg >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg >/dev/null
fi

python3 -m pip install -q -c /tmp/openatlas-torch-pin.txt -r requirements.txt

if [ ! -x /shared-docker/bin/cloudflared ]; then
  mkdir -p /shared-docker/bin
  python3 -c 'import urllib.request; urllib.request.urlretrieve("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "/shared-docker/bin/cloudflared")'
  chmod +x /shared-docker/bin/cloudflared
fi

python3 -c 'import torch, transformers; print("torch", torch.__version__, "| HIP", torch.version.hip, "| transformers", transformers.__version__, "| GPU", torch.cuda.get_device_name(0), "| bf16", torch.cuda.is_bf16_supported())'
ffmpeg -version | head -1
/shared-docker/bin/cloudflared --version
python3 -c 'import importlib.util as u; print("bitsandbytes installed:", u.find_spec("bitsandbytes") is not None)'
touch "$MARKER"
