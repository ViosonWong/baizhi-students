#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/100waytoai/local-asr}"
SERVICE_NAME="${SERVICE_NAME:-baizhi-faster-whisper-asr}"
MODEL="${FASTER_WHISPER_MODEL:-base}"
DEVICE="${FASTER_WHISPER_DEVICE:-cpu}"
COMPUTE_TYPE="${FASTER_WHISPER_COMPUTE_TYPE:-int8}"
BEAM_SIZE="${FASTER_WHISPER_BEAM_SIZE:-5}"
USE_DOCKER="${ASR_USE_DOCKER:-auto}"
HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
HF_HUB_DISABLE_XET="${HF_HUB_DISABLE_XET:-1}"
MODEL_CACHE_DIR="${ASR_MODEL_CACHE_DIR:-/opt/100waytoai/asr-model-cache}"
DOCKER_NETWORK="${ASR_DOCKER_NETWORK:-100waytoai_webnet}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root, or with sudo." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required. Install Python 3 first." >&2
  exit 1
fi

mkdir -p "$APP_DIR"
cp -R "$(dirname "$0")/../local-asr/." "$APP_DIR/"

if [[ "$USE_DOCKER" == "auto" ]]; then
  PY_VERSION="$(python3 - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
)"
  if command -v docker >/dev/null 2>&1 && [[ "$(printf '%s\n' "3.8" "$PY_VERSION" | sort -V | head -n1)" != "3.8" ]]; then
    USE_DOCKER=1
  else
    USE_DOCKER=0
  fi
fi

if [[ "$USE_DOCKER" == "1" ]]; then
  mkdir -p "$MODEL_CACHE_DIR"
  docker rm -f "$SERVICE_NAME" >/dev/null 2>&1 || true
  docker build -t baizhi-faster-whisper-asr:latest "$APP_DIR"
  docker run -d \
    --name "$SERVICE_NAME" \
    --restart unless-stopped \
    -p 127.0.0.1:8000:8000 \
    -v "$MODEL_CACHE_DIR:/root/.cache/huggingface" \
    -e FASTER_WHISPER_MODEL="$MODEL" \
    -e FASTER_WHISPER_DEVICE="$DEVICE" \
    -e FASTER_WHISPER_COMPUTE_TYPE="$COMPUTE_TYPE" \
    -e FASTER_WHISPER_BEAM_SIZE="$BEAM_SIZE" \
    -e HF_ENDPOINT="$HF_ENDPOINT" \
    -e HF_HUB_DISABLE_XET="$HF_HUB_DISABLE_XET" \
    baizhi-faster-whisper-asr:latest

  if docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
    docker network connect "$DOCKER_NETWORK" "$SERVICE_NAME" 2>/dev/null || true
  fi

  echo "ASR Docker container installed: ${SERVICE_NAME}"
  echo "Health check:"
  sleep 2
  curl -fsS http://127.0.0.1:8000/health || true
  exit 0
fi

python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install --upgrade pip
"$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements.txt"

cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Baizhi faster-whisper local ASR
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=FASTER_WHISPER_MODEL=${MODEL}
Environment=FASTER_WHISPER_DEVICE=${DEVICE}
Environment=FASTER_WHISPER_COMPUTE_TYPE=${COMPUTE_TYPE}
Environment=FASTER_WHISPER_BEAM_SIZE=${BEAM_SIZE}
ExecStart=${APP_DIR}/.venv/bin/uvicorn faster_whisper_server:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo "ASR service installed: ${SERVICE_NAME}"
echo "Health check:"
curl -fsS http://127.0.0.1:8000/health || true
