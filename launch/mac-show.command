#!/bin/sh
# Show launcher for macOS: a local server and Chrome with the controller, offline-capable. Double-click in Finder.
#   ./mac-show.command                 the controller; press O for the output window
#   ./mac-show.command output 1920     also open the output full screen on the screen starting at x = 1920
#   SHOW_QUERY='world=nashua&ends=pingpong' ./mac-show.command
# Needs Node.js 18 or newer. Tested only as far as INSTALL.md says.
cd "$(dirname "$0")/.." || exit 1
PORT=8093
Q="${SHOW_QUERY:-world=shanshui}"
APP="/Applications/Google Chrome.app"
[ -d "$APP" ] || { echo "Google Chrome not found in /Applications"; exit 1; }
node tools/serve.mjs --port "$PORT" > /dev/null 2>&1 &
sleep 2
PROFILE="$HOME/Library/Application Support/shanshui-show"
open -na "$APP" --args --user-data-dir="$PROFILE" --no-first-run --autoplay-policy=no-user-gesture-required \
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
  --new-window "http://localhost:$PORT/?offline=1&$Q"
if [ "$1" = "output" ]; then
  sleep 3
  open -na "$APP" --args --user-data-dir="$PROFILE" --app="http://localhost:$PORT/output.html?offline=1" \
    --window-position="${2:-1920},0" --start-fullscreen
fi
