#!/bin/sh
# One node of a wall (WALL.md), full screen on the display at x = $5:
#   ./wall-node.command <cols> <rows> <col> <row> [x] [extra]
#   ./wall-node.command 2 1 1 0 1920 'sync=ws://192.168.1.10:8097'
[ -n "$4" ] || { echo "usage: wall-node.command cols rows col row [x] [extra]"; exit 1; }
. "$(dirname "$0")/_common.sh"
"$APP" $FLAGS --new-window --window-position="${5:-0},0" --kiosk "http://localhost:$PORT/output.html?offline=1&wall=$1x$2&col=$3&row=$4&$6" > /dev/null 2>&1 &
