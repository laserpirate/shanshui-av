#!/bin/sh
# The output full screen (kiosk) on the display whose left edge is at x = $1 (default 1920). Follows the controller.
. "$(dirname "$0")/_common.sh"
"$APP" $FLAGS --new-window --window-position="${1:-1920},0" --kiosk "http://localhost:$PORT/output.html?offline=1" > /dev/null 2>&1 &
