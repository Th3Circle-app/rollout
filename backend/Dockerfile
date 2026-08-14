# Rollout engine — FastAPI + CLAP (mood) + demucs/whisper (lyric align) +
# rembg (cut-out) + ffmpeg (audio cut / video mux). CPU build.
FROM python:3.11-slim

# ffmpeg/ffprobe are required and are NOT pip-installable; git is needed by a
# couple of ML deps that pull from source.
# ffmpeg/ffprobe (audio+video), git (source deps), libgomp1 (onnxruntime/rembg
# link it at import), libsndfile1 (librosa/soundfile), libglib2.0-0 (opencv path).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg git libgomp1 libsndfile1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the CPU torch wheels first so we don't pull multi-GB CUDA builds,
# then the rest of the pinned manifest.
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.2.2 torchaudio==2.2.2 \
      --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

# Model checkpoints (CLAP ~2GB, demucs ~80MB, whisper ~460MB, rembg ~170MB)
# download to the HF/torch caches on first use. For fast cold starts mount a
# persistent volume at /root/.cache or pre-warm them in a build step.
# The premium Remotion lyric-video path (../video) is NOT bundled here; the
# engine falls back to the classic ffmpeg renderer, which is self-contained.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
