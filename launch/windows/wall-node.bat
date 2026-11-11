@echo off
rem One node of a wall (WALL.md), full screen on the screen at x = %5:
rem   wall-node.bat <cols> <rows> <col> <row> [x] [extra]
rem   wall-node.bat 3 1 0 0 0 "overlap=160&cal=1"
rem   wall-node.bat 2 1 1 0 1920 "sync=ws://192.168.1.10:8097"     (follow a controller on the LAN)
rem   wall-node.bat 2 1 1 0 1920 "t0=1794355200000&speed=40&world=nashua"   (clock mode, no controller)
setlocal
if "%4"=="" (echo usage: wall-node.bat cols rows col row [x] [extra] & exit /b 1)
call "%~dp0_common.bat" || exit /b 1
set X=%5
if "%X%"=="" set X=0
set EXTRA=%~6
start "" "%BROWSER%" %FLAGS% --new-window --window-position=%X%,0 --kiosk "http://localhost:%PORT%/output.html?offline=1&wall=%1x%2&col=%3&row=%4&%EXTRA%"
endlocal
