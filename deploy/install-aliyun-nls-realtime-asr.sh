#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/100waytoai/realtime-asr}"
SERVICE_NAME="${SERVICE_NAME:-baizhi-aliyun-nls-realtime-asr}"
DOCKER_NETWORK="${ASR_DOCKER_NETWORK:-100waytoai_webnet}"
SESSION_DIR="${ASR_REALTIME_SESSION_DIR:-/opt/100waytoai/asr-realtime-sessions}"
CLASS_AUDIO_DATA_DIR="${CLASS_AUDIO_DATA_DIR:-/opt/100waytoai/class-audio-records}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root, or with sudo." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required." >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$SESSION_DIR" "$CLASS_AUDIO_DATA_DIR"
cp -R "$(dirname "$0")/../realtime-asr/." "$APP_DIR/"

declare -A EXISTING_ENV=()
if docker inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  while IFS='=' read -r key value; do
    if [[ -n "$key" ]]; then
      EXISTING_ENV["$key"]="$value"
    fi
  done < <(docker inspect "$SERVICE_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}')
fi

env_value() {
  local name="$1"
  local default_value="${2:-}"

  if [[ -n "${!name+x}" && -n "${!name}" ]]; then
    printf '%s' "${!name}"
    return
  fi

  if [[ -n "${EXISTING_ENV[$name]+x}" ]]; then
    printf '%s' "${EXISTING_ENV[$name]}"
    return
  fi

  printf '%s' "$default_value"
}

docker rm -f "$SERVICE_NAME" >/dev/null 2>&1 || true
docker build -t baizhi-aliyun-nls-realtime-asr:latest "$APP_DIR"

ENV_ARGS=(
  -e PORT=8787
  -e ALIYUN_NLS_APPKEY="$(env_value ALIYUN_NLS_APPKEY)"
  -e ALIYUN_NLS_TOKEN="$(env_value ALIYUN_NLS_TOKEN)"
  -e ALIYUN_ACCESS_KEY_ID="$(env_value ALIYUN_ACCESS_KEY_ID)"
  -e ALIYUN_ACCESS_KEY_SECRET="$(env_value ALIYUN_ACCESS_KEY_SECRET)"
  -e ALIYUN_NLS_META_ENDPOINT="$(env_value ALIYUN_NLS_META_ENDPOINT https://nls-meta.cn-shanghai.aliyuncs.com)"
  -e ALIYUN_NLS_WS_ENDPOINT="$(env_value ALIYUN_NLS_WS_ENDPOINT wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1)"
  -e ALIYUN_NLS_META_REGION="$(env_value ALIYUN_NLS_META_REGION cn-shanghai)"
  -e ALIYUN_NLS_MAX_SENTENCE_SILENCE="$(env_value ALIYUN_NLS_MAX_SENTENCE_SILENCE 800)"
  -e ASR_REALTIME_SESSION_DIR=/data/sessions
  -e CLASS_AUDIO_DATA_DIR=/data/class-audio-records
  -e CLASS_AUDIO_MAX_BYTES="$(env_value CLASS_AUDIO_MAX_BYTES 104857600)"
  -e CLASS_AUDIO_DATABASE_URL="$(env_value CLASS_AUDIO_DATABASE_URL "${DATABASE_URL:-}")"
  -e CLASS_AUDIO_DATABASE_SSL="$(env_value CLASS_AUDIO_DATABASE_SSL false)"
  -e CLASS_AUDIO_PUBLIC_BASE_URL="$(env_value CLASS_AUDIO_PUBLIC_BASE_URL)"
  -e ASR_PROVIDER="$(env_value ASR_PROVIDER local)"
  -e ASR_API_URL="$(env_value ASR_API_URL http://baizhi-faster-whisper-asr:8000/asr)"
  -e ASR_API_TOKEN="$(env_value ASR_API_TOKEN)"
  -e BAIZHI_ASR_MODEL="$(env_value BAIZHI_ASR_MODEL)"
  -e DASHSCOPE_API_KEY="$(env_value DASHSCOPE_API_KEY "${ALIYUN_DASHSCOPE_API_KEY:-}")"
  -e DASHSCOPE_API_BASE="$(env_value DASHSCOPE_API_BASE https://dashscope.aliyuncs.com/api/v1)"
  -e ALIYUN_FUN_ASR_MODEL="$(env_value ALIYUN_FUN_ASR_MODEL fun-asr)"
  -e ALIYUN_FUN_ASR_DIARIZATION="$(env_value ALIYUN_FUN_ASR_DIARIZATION true)"
  -e ALIYUN_FUN_ASR_SPEAKER_COUNT="$(env_value ALIYUN_FUN_ASR_SPEAKER_COUNT)"
  -e ALIYUN_FUN_ASR_POLL_INTERVAL_MS="$(env_value ALIYUN_FUN_ASR_POLL_INTERVAL_MS 3000)"
  -e ALIYUN_FUN_ASR_POLL_MAX_ATTEMPTS="$(env_value ALIYUN_FUN_ASR_POLL_MAX_ATTEMPTS 90)"
  -e COZE_API_TOKEN="$(env_value COZE_API_TOKEN)"
  -e COZE_CODE_API_TOKEN="$(env_value COZE_CODE_API_TOKEN)"
  -e COZE_AGENT_PROVIDER="$(env_value COZE_AGENT_PROVIDER coze_code)"
  -e COZE_CODE_BASE_URL="$(env_value COZE_CODE_BASE_URL https://9x8p8tz864.coze.site)"
  -e COZE_CODE_PROJECT_ID="$(env_value COZE_CODE_PROJECT_ID 7647425305157615662)"
  -e COZE_BOT_ID="$(env_value COZE_BOT_ID)"
  -e COZE_API_BASE="$(env_value COZE_API_BASE https://api.coze.cn)"
  -e COZE_WORKFLOW_SUMMARY_ID="$(env_value COZE_WORKFLOW_SUMMARY_ID)"
  -e COZE_WORKFLOW_QUIZ_ID="$(env_value COZE_WORKFLOW_QUIZ_ID)"
  -e COZE_WORKFLOW_REVIEW_ID="$(env_value COZE_WORKFLOW_REVIEW_ID)"
  -e COZE_WORKFLOW_PARAMETERS_FORMAT="$(env_value COZE_WORKFLOW_PARAMETERS_FORMAT string)"
)

docker run -d \
  --name "$SERVICE_NAME" \
  --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -v "$SESSION_DIR:/data/sessions" \
  -v "$CLASS_AUDIO_DATA_DIR:/data/class-audio-records" \
  "${ENV_ARGS[@]}" \
  baizhi-aliyun-nls-realtime-asr:latest

if docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
  docker network connect "$DOCKER_NETWORK" "$SERVICE_NAME" 2>/dev/null || true
fi

echo "Aliyun NLS realtime ASR container installed: ${SERVICE_NAME}"
echo "Health check:"
sleep 1
curl -fsS http://127.0.0.1:8787/health || true
