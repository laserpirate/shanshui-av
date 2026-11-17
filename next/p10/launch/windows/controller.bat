@echo off
rem The controller on this screen (works offline after the first visit). Press O for the output, or run output.bat.
rem Page settings: set SHOW_QUERY=world=nashua^&ends=pingpong   before running.
setlocal
call "%~dp0_common.bat" || exit /b 1
if "%SHOW_QUERY%"=="" set SHOW_QUERY=world=shanshui
start "" "%BROWSER%" %FLAGS% --new-window "http://localhost:%PORT%/?offline=1&%SHOW_QUERY%"
endlocal
