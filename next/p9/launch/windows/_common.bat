@echo off
rem Shared by the Windows launchers: finds Chrome or Edge, starts the local server once, sets the flags.
rem Needs Node.js 18 or newer on the PATH.
cd /d "%~dp0..\.."
if "%PORT%"=="" set PORT=8093
set BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%BROWSER%" set BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%BROWSER%" set BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
if not exist "%BROWSER%" set BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%BROWSER%" (echo Chrome or Edge not found & exit /b 1)
curl -s -o nul "http://localhost:%PORT%/" || (start "shanshui server" /min node tools\serve.mjs --port %PORT% & timeout /t 2 /nobreak >nul)
set PROFILE=%LOCALAPPDATA%\shanshui-show
set FLAGS=--user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --ignore-gpu-blocklist --disable-session-crashed-bubble
