#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
FF="$ROOT/firefox"
mkdir -p "$FF/content" "$FF/popup" "$FF/icons" "$FF/background"
# Firefox runs no MV3 service worker: it takes the same file as a background
# script. Chrome warns on "scripts" under MV3, hence the swap here only.
sed 's#"service_worker": "background/service-worker.js"#"scripts": ["background/service-worker.js"]#' \
  "$ROOT/manifest.json" > "$FF/manifest.json"
cp "$ROOT/content/"*.js "$FF/content/"
cp "$ROOT/background/service-worker.js" "$FF/background/service-worker.js"
cp "$ROOT/popup/popup.html" "$FF/popup/popup.html"
cp "$ROOT/popup/popup.css" "$FF/popup/popup.css"
cp "$ROOT/popup/popup.js" "$FF/popup/popup.js"
cp "$ROOT/icons/"*.png "$FF/icons/"
echo "Synced root -> firefox/"
