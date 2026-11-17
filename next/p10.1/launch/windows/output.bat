@echo off
rem The output full screen (kiosk, no gesture needed) on the screen whose left edge is at x = %1 (default 1920).
rem It follows the controller opened by controller.bat (same browser profile, BroadcastChannel). Alt+F4 closes it.
setlocal
call "%~dp0_common.bat" || exit /b 1
set X=%1
if "%X%"=="" set X=1920
start "" "%BROWSER%" %FLAGS% --new-window --window-position=%X%,0 --kiosk "http://localhost:%PORT%/output.html?offline=1"
endlocal
