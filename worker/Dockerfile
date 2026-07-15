# Worker image (SPEC §14). ARM-friendly; includes the media toolchain
# (ffmpeg, rembg, WhisperX) + Turkish-capable fonts for subtitles.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# System deps for the media pipeline (SPEC §7, SETUP.md Part C).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 python3-pip python3-venv \
      fonts-noto-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# rembg + WhisperX in an isolated venv (avoids PEP 668 issues). WhisperX
# bundles the faster-whisper backend and adds wav2vec2 forced alignment for
# word-accurate karaoke subtitle timing (Turkish align model auto-selected).
# CPU-only torch wheels keep the aarch64 image lean (no CUDA payload).
RUN python3 -m venv /opt/pyenv \
    && /opt/pyenv/bin/pip install --no-cache-dir \
         --extra-index-url https://download.pytorch.org/whl/cpu \
         rembg whisperx
ENV PATH="/opt/pyenv/bin:$PATH"

WORKDIR /app

# Workspace manifests first for layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY worker/package.json worker/package.json
RUN pnpm install --frozen-lockfile --filter @agency-os/worker...

# Source: the worker needs the shared root lib/ too (imported relatively).
COPY lib ./lib
COPY worker ./worker

WORKDIR /app/worker
CMD ["pnpm", "start"]
