@echo off
setlocal
title LilPolaris Blog Admin
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0admin\scripts\start-local.ps1"
set "LAUNCHER_EXIT=%ERRORLEVEL%"
if not "%LAUNCHER_EXIT%"=="0" (
  echo.
  echo Failed to start LilPolaris Blog Admin. Check admin\.launcher\logs for details.
  if not defined LILPOLARIS_NO_BROWSER pause
)
exit /b %LAUNCHER_EXIT%
