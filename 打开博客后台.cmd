@echo off
setlocal
title LilPolaris Blog Admin
set "ADMIN_DIR=%~dp0admin"
set "ADMIN_URL=http://127.0.0.1:3199"

if not exist "%ADMIN_DIR%\.env.local" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ADMIN_DIR%\scripts\configure-local.ps1"
  if errorlevel 1 goto failed
)

if not exist "%ADMIN_DIR%\node_modules" (
  pushd "%ADMIN_DIR%"
  call npm.cmd ci
  if errorlevel 1 (
    popd
    goto failed
  )
  popd
)

if not exist "%ADMIN_DIR%\.next\BUILD_ID" (
  pushd "%ADMIN_DIR%"
  call npm.cmd run build
  if errorlevel 1 (
    popd
    goto failed
  )
  popd
)

curl.exe -fsS "%ADMIN_URL%" >nul 2>nul
if not errorlevel 1 goto ready

start "LilPolaris Admin Server" /min /d "%ADMIN_DIR%" npm.cmd run start -- --hostname 127.0.0.1 --port 3199
for /l %%I in (1,1,40) do (
  timeout /t 1 /nobreak >nul
  curl.exe -fsS "%ADMIN_URL%" >nul 2>nul
  if not errorlevel 1 goto ready
)
goto failed

:ready
if defined LILPOLARIS_NO_BROWSER exit /b 0
start "" "%ADMIN_URL%"
exit /b 0

:failed
echo.
echo Failed to start LilPolaris Blog Admin.
pause
exit /b 1
