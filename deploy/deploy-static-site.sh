#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-39.105.86.25}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/baizhi-students}"

cd "$(dirname "$0")/.."

rm -rf dist/static-site
mkdir -p dist/static-site
cp index.html baizhi-students-home-v3.html favicon.svg site.webmanifest robots.txt vercel.json netlify.toml _headers _redirects .htaccess dist/static-site/
cp -R api dist/static-site/

ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_DIR'"
rsync -az --delete -e "ssh -p $SERVER_PORT" dist/static-site/ "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/"

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
