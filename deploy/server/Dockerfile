# OpenAtlas backend (natlas_server.py): the N-ATLaS LLM and the four N-ATLaS ASR models, plus the optional
# speech renderer (ENABLE_TTS=1), on any NVIDIA GPU with 24 GB or more.
# Weights are not baked in: the repos are gated, so they download at start-up with HF_TOKEN into
# /root/.cache/huggingface. Mount a volume there to keep them between runs (docker-compose.yml does).
# torch 2.6: the ASR repos ship pytorch_model.bin, which recent transformers only loads on torch>=2.6.
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

# ffmpeg decodes the audio formats browsers record (webm, m4a) as well as wav/mp3/ogg/flac.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY natlas_server.py tts_renderer.py ./

# Inside a container the server must listen on all interfaces; publish the port or put a tunnel in front.
ENV HOST=0.0.0.0 PORT=8000 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "natlas_server.py"]
