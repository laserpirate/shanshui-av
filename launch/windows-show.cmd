@echo off
rem Show launcher for Windows: a local server and Chrome (or Edge) with the controller, offline-capable.
rem   windows-show.cmd                       the controller on the main screen; press O for the output window
rem   windows-show.cmd output 1920           also open the output full screen on the screen starting at x = 1920
rem Settings in the URL go in SHOW_QUERY, for example:  set SHOW_QUERY=world=nashua^&ends=pingpong
rem Needs Node.js 18 or newer on the PATH. Tested only as far as INSTALL.md says.
setlocal
cd /d "%~dp0.."
set PORT=8093
if "%SHOW_QUERY%"=="" set SHOW_QUERY=world=shanshui
set BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%BROWSER%" set BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%BROWSER%" set BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%BROWSER%" (echo Chrome or Edge not found & exit /b 1)
start "shanshui server" /min node tools\serve.mjs --port %PORT%
timeout /t 2 /nobreak >nul
set PROFILE=%LOCALAPPDATA%\shanshui-show
set FLAGS=--user-data-dir="%PROFILE%" --no-first-run --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --ignore-gpu-blocklist
start "" "%BROWSER%" %FLAGS% --new-window "http://localhost:%PORT%/?offline=1&%SHOW_QUERY%"
if /i "%1"=="output" (
  timeout /t 3 /nobreak >nul
  start "" "%BROWSER%" %FLAGS% --app="http://localhost:%PORT%/output.html?offline=1" --window-position=%2,0 --start-fullscreen
)
endlocal
