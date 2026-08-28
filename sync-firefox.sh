#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
FF="$ROOT/firefox"
mkdir -p "$FF/content" "$FF/popup" "$FF/icons"
cp "$ROOT/manifest.json" "$FF/manifest.json"
cp "$ROOT/content/player.js" "$FF/content/player.js"
cp "$ROOT/popup/popup.html" "$FF/popup/popup.html"
cp "$ROOT/popup/popup.css" "$FF/popup/popup.css"
cp "$ROOT/popup/popup.js" "$FF/popup/popup.js"
cp "$ROOT/icons/"*.png "$FF/icons/"
echo "Synced root -> firefox/"
