@echo off
rem ============================================================================
rem  Read the sky in our own voice. Double-click once; it does the rest, and
rem  from then on it does it by itself.
rem
rem  Why anything at all has to run here: VoiceStudio listens on 127.0.0.1:3900,
rem  which is an address that exists only on this machine. Nothing in the cloud
rem  can reach it — not the site, not GitHub, not me. So the reading happens
rem  here. Everything else — which whispers there are, where the audio goes,
rem  what has already been done — is handled by the site.
rem
rem  What this file does, in order:
rem    1. fetches the newest copy of the reader, so improvements arrive on their
rem       own and this file never needs downloading again
rem    2. makes sure ffmpeg is present (installs it if it is not)
rem    3. registers itself to run every night, so whispers written from now on
rem       are read without anyone thinking about it
rem    4. reads whatever has not been read yet, and uploads it
rem
rem  Safe to close at any point. Safe to run twice. Everything already done is
rem  recorded in voice-out\read.json and is skipped.
rem ============================================================================
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul

set "SITE=https://cubewithin.com"
set "TOKEN=__VOICE_UPLOAD_TOKEN__"
set "HERE=%~dp0"
set "TOKENFILE=%HERE%token.txt"
set "TASK=Are you alright - read new whispers"

rem --- scheduled runs pass --scheduled, and must never wait for a keypress ---
set "QUIET="
if /i "%~1"=="--scheduled" set "QUIET=1"

echo.
echo   Reading the sky in the brand voice.
echo   site   %SITE%
echo   studio http://127.0.0.1:3900
echo.

rem --- 0. the token ----------------------------------------------------------
rem This file is downloadable from the site, so it cannot ship with a secret in
rem it. It asks once and keeps the answer next to itself.
rem
rem The copy built by tools/build-voice-runner.mjs has the token substituted in
rem already and never reaches this block. The test is on the first two
rem characters rather than the whole placeholder so that it holds whether that
rem substitution replaces one occurrence or all of them — a real token does not
rem begin with two underscores.
if "%TOKEN:~0,2%"=="__" (
  if exist "%TOKENFILE%" (
    set /p TOKEN=<"%TOKENFILE%"
  ) else (
    echo   First run, so it needs the upload token once.
    echo   It is the value you put in the GitHub secret VOICE_UPLOAD_TOKEN.
    echo.
    set /p TOKEN="   Paste it and press Enter: "
    if not "!TOKEN!"=="" (
      >"%TOKENFILE%" echo !TOKEN!
      echo   Saved beside this file. It will not ask again.
    )
    echo.
  )
)
if "!TOKEN!"=="" (
  echo   No token, so nothing could be uploaded. Run this again and paste it.
  goto :done
)
if "!TOKEN:~0,2!"=="__" (
  echo   No token, so nothing could be uploaded. Run this again and paste it.
  goto :done
)

rem --- 1. the reader itself, always the current one --------------------------
rem Fetched every run rather than shipped once. This file is the only thing that
rem ever has to be downloaded by hand; the part that changes updates itself.
curl -fsSL "%SITE%/revoice.mjs" -o "%HERE%revoice.mjs.new" >nul 2>nul
if exist "%HERE%revoice.mjs.new" (
  move /y "%HERE%revoice.mjs.new" "%HERE%revoice.mjs" >nul
) else (
  if not exist "%HERE%revoice.mjs" (
    echo   Could not download the reader, and there is no copy here yet.
    echo   Check the internet connection and run this again.
    goto :done
  )
  echo   [offline] using the copy already here.
)

rem --- 2. node ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Get it from https://nodejs.org and run this again.
  goto :done
)

rem --- 3. ffmpeg -------------------------------------------------------------
rem The reading comes out of VoiceStudio as WAV, which is about seventeen times
rem the size of the AAC the site stores. ffmpeg is what does that, and the EQ.
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo   ffmpeg is missing. Installing it, once...
  winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements >nul 2>nul
  where ffmpeg >nul 2>nul
  if errorlevel 1 (
    echo.
    echo   ffmpeg could not be installed automatically.
    echo   Install it once from https://www.gyan.dev/ffmpeg/builds/ ^(add it to PATH^),
    echo   then run this file again. Nothing else will need doing.
    goto :done
  )
  echo   ffmpeg installed.
)

rem --- 4. every night, without being asked -----------------------------------
rem This is the answer to "do I have to do this every time". No: whispers written
rem after tonight are read at 3am while nobody is watching. The guard means the
rem task is created once and never duplicated.
schtasks /query /tn "%TASK%" >nul 2>nul
if errorlevel 1 (
  schtasks /create /tn "%TASK%" /tr "\"%~f0\" --scheduled" /sc daily /st 03:00 /f >nul 2>nul
  if errorlevel 1 (
    echo   [note] could not schedule the nightly run. Double-click this file
    echo          whenever you want new whispers read.
  ) else (
    echo   Scheduled: new whispers are read every night at 3am.
  )
)

rem --- 5. read whatever has not been read ------------------------------------
echo.
node "%HERE%revoice.mjs" --all --upload --site "%SITE%" --out "%HERE%voice-out" --token "!TOKEN!"

:done
echo.
if not defined QUIET pause
endlocal
