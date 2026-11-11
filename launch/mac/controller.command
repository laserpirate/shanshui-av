#!/bin/sh
# The controller (works offline after the first visit). Double-click in Finder; the first time, right-click, Open.
#   SHOW_QUERY='world=nashua&ends=pingpong' ./controller.command
. "$(dirname "$0")/_common.sh"
"$APP" $FLAGS --new-window "http://localhost:$PORT/?offline=1&${SHOW_QUERY:-world=shanshui}" > /dev/null 2>&1 &
