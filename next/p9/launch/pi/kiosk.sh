#!/bin/sh
# Raspberry Pi (Raspberry Pi OS with desktop): one output in kiosk, no controller on screen. Baked tiles (make them on a
# bigger machine with tools/bake.mjs, copy baked/ and precache.json across) and the lowest quality rung.
#   ./kiosk.sh                                         clock mode: the scroll from UTC time, no network needed
#   SYNC=ws://192.168.1.10:8097 ./kiosk.sh             follow a controller through tools/wall-server.mjs
#   WALL='wall=3x1&col=2&row=0&overlap=160' ./kiosk.sh  one node of a wall (WALL.md)
# Settings: WORLD (nashua), SEED (1), SPEED (40 px/s), T0 (epoch ms; every node of a clock wall needs the same one).
# Not tried on a Pi: WebGL2 support and frame rate there are unverified.
cd "$(dirname "$0")/../.." || exit 1
PORT="${PORT:-8093}"
curl -s -o /dev/null "http://localhost:$PORT/" || { node tools/serve.mjs --port "$PORT" > /dev/null 2>&1 & sleep 3; }
Q="offline=1&baked=1&quality=low&world=${WORLD:-nashua}"
if [ -n "$SYNC" ]; then Q="$Q&sync=$SYNC"; else Q="$Q&t0=${T0:-1794355200000}&speed=${SPEED:-40}&seed=${SEED:-1}"; fi
[ -n "$WALL" ] && Q="$Q&$WALL"
BROWSER=$(command -v chromium-browser || command -v chromium)
[ -n "$BROWSER" ] || { echo "Chromium not found"; exit 1; }
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required --ignore-gpu-blocklist --enable-gpu-rasterization \
  --user-data-dir="$HOME/.config/shanshui-show" "http://localhost:$PORT/output.html?$Q"
