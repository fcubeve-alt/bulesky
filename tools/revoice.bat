@echo off
rem ============================================================================
rem  Are you alright - read the sky in our own voice.
rem
rem  Double-click this. It asks for one thing the first time and nothing ever
rem  after that.
rem
rem  !! THIS FILE STAYS THIS SMALL. Every decision lives in revoice.mjs, which
rem  can be run and tested; cmd.exe cannot be, not from where this is written.
rem  An earlier version of this file did the token prompt, the ffmpeg install
rem  and the scheduling itself, in batch, untested, and it fell out of a
rem  parenthesised block before it ever asked anything. So: no IF blocks, no
rem  delayed expansion, no prompting, nothing outside plain ASCII. Find node,
rem  fetch the reader, run it, keep the window open. Nothing else belongs here.
rem  tools/revoice-test.mjs fails if any of those creep back in.
rem ============================================================================
cd /d "%~dp0"

echo.
echo   Are you alright - reading the sky in our own voice
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

rem The reader, fetched every run, so this file never needs downloading again.
curl -fsSL "https://cubewithin.com/revoice.mjs" -o "revoice.new" >nul 2>nul
if exist "revoice.new" move /y "revoice.new" "revoice.mjs" >nul
if not exist "revoice.mjs" goto nofile

node "revoice.mjs" --setup
goto end

:nonode
echo   Node.js is not installed on this machine.
echo   Get it from https://nodejs.org, then double-click this file again.
goto end

:nofile
echo   Could not download the reader, and there is no copy here yet.
echo   Check the internet connection, then double-click this file again.
goto end

:end
echo.
if /i not "%~1"=="--scheduled" pause
