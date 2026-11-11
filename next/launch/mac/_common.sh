#!/bin/sh
# Shared by the macOS launchers: finds Chrome, starts the local server once, sets the flags. Needs Node.js 18+.
cd "$(dirname "$0")/../.." || exit 1
PORT="${PORT:-8093}"
APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$APP" ] || { echo "Google Chrome not found in /Applications"; exit 1; }
curl -s -o /dev/null "http://localhost:$PORT/" || { node tools/serve.mjs --port "$PORT" > /dev/null 2>&1 & sleep 2; }
PROFILE="$HOME/Library/Application Support/shanshui-show"
FLAGS="--user-data-dir=$PROFILE --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows"
