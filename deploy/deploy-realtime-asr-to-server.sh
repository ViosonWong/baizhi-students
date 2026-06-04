#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-39.105.86.25}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_KEY="${SERVER_KEY:-}"
REMOTE_TMP="${REMOTE_TMP:-/tmp/baizhi-realtime-asr-deploy}"

SSH_CMD=(ssh -p "$SERVER_PORT")
SCP_CMD=(scp -P "$SERVER_PORT")

if [[ -n "$SERVER_KEY" ]]; then
  SSH_CMD+=( -i "$SERVER_KEY" )
  SCP_CMD+=( -i "$SERVER_KEY" )
fi

cd "$(dirname "$0")/.."

tar --format ustar --no-mac-metadata -czf /tmp/baizhi-realtime-asr.tgz realtime-asr deploy/install-aliyun-nls-realtime-asr.sh

"${SSH_CMD[@]}" "$SERVER_USER@$SERVER_HOST" "rm -rf '$REMOTE_TMP' && mkdir -p '$REMOTE_TMP'"
"${SCP_CMD[@]}" /tmp/baizhi-realtime-asr.tgz "$SERVER_USER@$SERVER_HOST:$REMOTE_TMP/"

REMOTE_ENV=()
for name in \
  ALIYUN_NLS_APPKEY \
  ALIYUN_NLS_TOKEN \
  ALIYUN_ACCESS_KEY_ID \
  ALIYUN_ACCESS_KEY_SECRET \
  ALIYUN_NLS_META_ENDPOINT \
  ALIYUN_NLS_WS_ENDPOINT \
  ALIYUN_NLS_META_REGION \
  ALIYUN_NLS_MAX_SENTENCE_SILENCE \
  ASR_REALTIME_SESSION_DIR \
  CLASS_AUDIO_DATA_DIR \
  CLASS_AUDIO_MAX_BYTES \
  CLASS_AUDIO_DATABASE_URL \
  CLASS_AUDIO_DATABASE_SSL \
  CLASS_AUDIO_PUBLIC_BASE_URL \
  DATABASE_URL \
  ASR_PROVIDER \
  ASR_API_URL \
  ASR_API_TOKEN \
  BAIZHI_ASR_MODEL \
  DASHSCOPE_API_KEY \
  ALIYUN_DASHSCOPE_API_KEY \
  DASHSCOPE_API_BASE \
  ALIYUN_FUN_ASR_MODEL \
  ALIYUN_FUN_ASR_DIARIZATION \
  ALIYUN_FUN_ASR_SPEAKER_COUNT \
  ALIYUN_FUN_ASR_POLL_INTERVAL_MS \
  ALIYUN_FUN_ASR_POLL_MAX_ATTEMPTS \
  COZE_API_TOKEN \
  COZE_CODE_API_TOKEN \
  COZE_AGENT_PROVIDER \
  COZE_CODE_BASE_URL \
  COZE_CODE_PROJECT_ID \
  COZE_BOT_ID \
  COZE_API_BASE \
  COZE_WORKFLOW_SUMMARY_ID \
  COZE_WORKFLOW_QUIZ_ID \
  COZE_WORKFLOW_REVIEW_ID \
  COZE_WORKFLOW_PARAMETERS_FORMAT \
  ASR_DOCKER_NETWORK; do
  if [[ -n "${!name:-}" ]]; then
    REMOTE_ENV+=( "$name=${!name}" )
  fi
done

REMOTE_PREFIX=""
if [[ ${#REMOTE_ENV[@]} -gt 0 ]]; then
  REMOTE_PREFIX="$(printf '%q ' "${REMOTE_ENV[@]}")"
fi

"${SSH_CMD[@]}" "$SERVER_USER@$SERVER_HOST" "cd '$REMOTE_TMP' && tar -xzf baizhi-realtime-asr.tgz && ${REMOTE_PREFIX}bash deploy/install-aliyun-nls-realtime-asr.sh"

echo "Remote realtime ASR deployed to $SERVER_USER@$SERVER_HOST"
