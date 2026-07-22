@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

if not exist "%ROOT_DIR%\scripts\ops\update-login-share-url.cmd" (
  echo Missing script: %ROOT_DIR%\scripts\ops\update-login-share-url.cmd
  exit /b 1
)

call "%ROOT_DIR%\scripts\ops\update-login-share-url.cmd" %*
exit /b %ERRORLEVEL%
