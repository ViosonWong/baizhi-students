#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-39.105.86.25}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_KEY="${SERVER_KEY:-}"
REMOTE_TMP="${REMOTE_TMP:-/tmp/baizhi-asr-deploy}"

SSH_CMD=(ssh -p "$SERVER_PORT")
SCP_CMD=(scp -P "$SERVER_PORT")

if [[ -n "$SERVER_KEY" ]]; then
  SSH_CMD+=( -i "$SERVER_KEY" )
  SCP_CMD+=( -i "$SERVER_KEY" )
fi

cd "$(dirname "$0")/.."

tar --format ustar --no-mac-metadata -czf /tmp/baizhi-local-asr.tgz local-asr deploy/install-faster-whisper-asr.sh

"${SSH_CMD[@]}" "$SERVER_USER@$SERVER_HOST" "rm -rf '$REMOTE_TMP' && mkdir -p '$REMOTE_TMP'"
"${SCP_CMD[@]}" /tmp/baizhi-local-asr.tgz "$SERVER_USER@$SERVER_HOST:$REMOTE_TMP/"
"${SSH_CMD[@]}" "$SERVER_USER@$SERVER_HOST" "cd '$REMOTE_TMP' && tar -xzf baizhi-local-asr.tgz && bash deploy/install-faster-whisper-asr.sh"

echo "Remote ASR deployed to $SERVER_USER@$SERVER_HOST"
