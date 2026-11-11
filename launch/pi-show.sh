#!/bin/sh
# Show launcher for a Raspberry Pi (Raspberry Pi OS with desktop): one output, kiosk, no controller on screen.
# The Pi draws baked tiles (node tools/bake.mjs on a bigger machine first, then copy baked/ across) and holds the
# lowest quality rung. Two ways to drive it:
#   ./pi-show.sh                                   clock mode: a fixed scroll from UTC time, no network needed
#   SYNC=ws://192.168.1.10:8097 ./pi-show.sh       follow a controller through tools/wall-server.mjs
#   WALL='wall=3x1&col=2&row=0&overlap=160' ./pi-show.sh     one node of a wall (see WALL.md)
# Not tried on a Pi: WebGL2 and frame rate there are unverified.
cd "$(dirname "$0")/.." || exit 1
PORT=8093
WORLD="${WORLD:-nashua}"
T0="${T0:-1794355200000}"
node tools/serve.mjs --port "$PORT" > /dev/null 2>&1 &
sleep 3
Q="offline=1&baked=1&quality=low&world=$WORLD"
if [ -n "$SYNC" ]; then Q="$Q&sync=$SYNC"; else Q="$Q&t0=$T0&speed=${SPEED:-40}&seed=${SEED:-1}"; fi
[ -n "$WALL" ] && Q="$Q&$WALL"
BROWSER=$(command -v chromium-browser || command -v chromium)
[ -n "$BROWSER" ] || { echo "Chromium not found"; exit 1; }
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --no-first-run --autoplay-policy=no-user-gesture-required \
  --ignore-gpu-blocklist --enable-gpu-rasterization --user-data-dir="$HOME/.config/shanshui-show" \
  "http://localhost:$PORT/output.html?$Q"
