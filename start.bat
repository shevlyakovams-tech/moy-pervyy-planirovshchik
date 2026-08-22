@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Не удалось запустить приложение: Node.js не найден.
  echo Сначала установите Node.js LTS 22.12-24.x с официального сайта:
  echo https://nodejs.org/
  echo Затем выполните setup.bat и снова запустите start.bat.
  goto :failure
)

node scripts\preflight-start.mjs
if errorlevel 1 goto :failure

set NEXT_TELEMETRY_DISABLED=1
start "Сначала — ты" /min cmd.exe /d /c call "%CD%\node_modules\.bin\electron.cmd" "%CD%\dist-electron\main.cjs"
exit /b 0

:failure
echo.
if "%UTRENNIY_NONINTERACTIVE%"=="1" exit /b 1
echo Нажмите любую клавишу, чтобы закрыть это окно.
pause >nul
exit /b 1
