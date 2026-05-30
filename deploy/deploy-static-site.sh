#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-39.105.86.25}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
SERVER_KEY="${SERVER_KEY:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/100waytoai/baizhi-static}"
DEPLOY_METHOD="${DEPLOY_METHOD:-tar}"
SSH_CMD=(ssh -p "$SERVER_PORT")

if [[ -n "$SERVER_KEY" ]]; then
  SSH_CMD+=( -i "$SERVER_KEY" )
fi

cd "$(dirname "$0")/.."

rm -rf dist/static-site
mkdir -p dist/static-site
cp index.html baizhi-students-home-v3.html favicon.svg site.webmanifest robots.txt vercel.json netlify.toml _headers _redirects .htaccess dist/static-site/
cp -R api dist/static-site/

if [[ "$DEPLOY_METHOD" == "rsync" ]] && command -v rsync >/dev/null 2>&1; then
  "${SSH_CMD[@]}" "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_DIR'"
  rsync -az --delete -e "$(printf '%q ' "${SSH_CMD[@]}")" dist/static-site/ "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/"
else
  COPYFILE_DISABLE=1 tar -C dist/static-site --format ustar --no-mac-metadata -czf - . | "${SSH_CMD[@]}" "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_DIR' && find '$REMOTE_DIR' -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C '$REMOTE_DIR' -xzf -"
fi

cat <<EOF
Static files synced to $SERVER_USER@$SERVER_HOST:$REMOTE_DIR

If Caddy is already serving www.100waytoai.com, point that site block to:
  root * $REMOTE_DIR
  try_files {path} /index.html
  file_server

Then reload Caddy:
  sudo caddy validate --config /etc/caddy/Caddyfile
  sudo systemctl reload caddy
EOF
