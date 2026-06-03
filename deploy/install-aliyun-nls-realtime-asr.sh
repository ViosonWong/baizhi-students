#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/100waytoai/realtime-asr}"
SERVICE_NAME="${SERVICE_NAME:-baizhi-aliyun-nls-realtime-asr}"
DOCKER_NETWORK="${ASR_DOCKER_NETWORK:-100waytoai_webnet}"
SESSION_DIR="${ASR_REALTIME_SESSION_DIR:-/opt/100waytoai/asr-realtime-sessions}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root, or with sudo." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required." >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$SESSION_DIR"
cp -R "$(dirname "$0")/../realtime-asr/." "$APP_DIR/"

docker rm -f "$SERVICE_NAME" >/dev/null 2>&1 || true
docker build -t baizhi-aliyun-nls-realtime-asr:latest "$APP_DIR"

ENV_ARGS=(
  -e PORT=8787
  -e ALIYUN_NLS_APPKEY="${ALIYUN_NLS_APPKEY:-}"
  -e ALIYUN_NLS_TOKEN="${ALIYUN_NLS_TOKEN:-}"
  -e ALIYUN_ACCESS_KEY_ID="${ALIYUN_ACCESS_KEY_ID:-}"
  -e ALIYUN_ACCESS_KEY_SECRET="${ALIYUN_ACCESS_KEY_SECRET:-}"
  -e ALIYUN_NLS_META_ENDPOINT="${ALIYUN_NLS_META_ENDPOINT:-https://nls-meta.cn-shanghai.aliyuncs.com}"
  -e ALIYUN_NLS_WS_ENDPOINT="${ALIYUN_NLS_WS_ENDPOINT:-wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1}"
  -e ALIYUN_NLS_META_REGION="${ALIYUN_NLS_META_REGION:-cn-shanghai}"
  -e ALIYUN_NLS_MAX_SENTENCE_SILENCE="${ALIYUN_NLS_MAX_SENTENCE_SILENCE:-800}"
  -e ASR_REALTIME_SESSION_DIR=/data/sessions
)

docker run -d \
  --name "$SERVICE_NAME" \
  --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -v "$SESSION_DIR:/data/sessions" \
  "${ENV_ARGS[@]}" \
  baizhi-aliyun-nls-realtime-asr:latest

if docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
  docker network connect "$DOCKER_NETWORK" "$SERVICE_NAME" 2>/dev/null || true
fi

echo "Aliyun NLS realtime ASR container installed: ${SERVICE_NAME}"
echo "Health check:"
sleep 1
curl -fsS http://127.0.0.1:8787/health || true
