# N-ATLaS ASR worker for RunPod Serverless (build-from-GitHub, or any Docker builder).
# torch 2.6 is required: the ASR repos ship pytorch_model.bin, which recent transformers
# refuses to torch.load on older torch versions.
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY handler.py .

# Weights are NOT baked into the image (they're gated; HF_TOKEN is a runtime secret).
CMD ["python", "-u", "handler.py"]
