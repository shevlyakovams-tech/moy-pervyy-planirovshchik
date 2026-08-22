@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Не удалось начать настройку: Node.js не найден.
  echo Установите Node.js LTS 22.12-24.x с официального сайта:
  echo https://nodejs.org/
  echo После установки снова запустите setup.bat.
  set "SETUP_EXIT_CODE=1"
  goto :finish
)
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo Не удалось начать настройку: npm не найден.
  echo Переустановите Node.js LTS с официального сайта:
  echo https://nodejs.org/
  set "SETUP_EXIT_CODE=1"
  goto :finish
)

node scripts\check-environment.mjs
if errorlevel 1 (
  set "SETUP_EXIT_CODE=1"
  goto :finish
)

set NEXT_TELEMETRY_DISABLED=1
call npm ci
if errorlevel 1 (
  echo.
  echo Настройка остановлена: не удалось установить зависимости.
  set "SETUP_EXIT_CODE=1"
  goto :finish
)
call npm run prisma:generate
if errorlevel 1 (
  echo.
  echo Настройка остановлена: не удалось подготовить базу данных.
  set "SETUP_EXIT_CODE=1"
  goto :finish
)
call npm run electron:install
if errorlevel 1 (
  echo.
  echo Настройка остановлена: не удалось подготовить приложение для Windows.
  set "SETUP_EXIT_CODE=1"
  goto :finish
)
call npm run setup:internal
if errorlevel 1 (
  echo.
  echo Настройка не завершена. Исправьте указанную выше ошибку и повторите setup.bat.
  set "SETUP_EXIT_CODE=1"
  goto :finish
)

echo.
echo Настройка успешно завершена. Теперь можно запустить start.bat.
set "SETUP_EXIT_CODE=0"

:finish
echo.
if "%UTRENNIY_NONINTERACTIVE%"=="1" exit /b %SETUP_EXIT_CODE%
echo Нажмите любую клавишу, чтобы закрыть это окно.
pause >nul
exit /b %SETUP_EXIT_CODE%
