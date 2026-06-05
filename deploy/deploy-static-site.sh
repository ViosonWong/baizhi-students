#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-39.105.86.25}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_KEY="${SERVER_KEY:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/100waytoai/baizhi-static}"
DEPLOY_METHOD="${DEPLOY_METHOD:-tar}"
BUILD_COMMAND="${BUILD_COMMAND:-npm run build}"
SSH_CMD=(ssh -p "$SERVER_PORT")

if [[ -n "$SERVER_KEY" ]]; then
  SSH_CMD+=( -i "$SERVER_KEY" )
fi

cd "$(dirname "$0")/.."

echo "Building production static assets with: $BUILD_COMMAND"
$BUILD_COMMAND

if [[ ! -f dist/index.html ]]; then
  echo "Expected dist/index.html after build, but it was not found." >&2
  exit 1
fi

if [[ "$DEPLOY_METHOD" == "rsync" ]] && command -v rsync >/dev/null 2>&1; then
  "${SSH_CMD[@]}" "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_DIR'"
  rsync -az --delete -e "$(printf '%q ' "${SSH_CMD[@]}")" dist/ "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/"
else
  COPYFILE_DISABLE=1 tar -C dist --format ustar --no-mac-metadata -czf - . | "${SSH_CMD[@]}" "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_DIR' && find '$REMOTE_DIR' -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C '$REMOTE_DIR' -xzf -"
fi

cat <<EOF
Static files synced to $SERVER_USER@$SERVER_HOST:$REMOTE_DIR

For Docker Caddy, make sure $REMOTE_DIR is mounted to /srv/baizhi-students.

If Caddy is serving files directly on the host, point that site block to:
  root * $REMOTE_DIR
  try_files {path} /index.html
  file_server

Then reload Caddy:
  sudo caddy validate --config /etc/caddy/Caddyfile
  sudo systemctl reload caddy
EOF
