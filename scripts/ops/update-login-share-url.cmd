@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "ROOT_DIR="
if exist "%SCRIPT_DIR%\.env" (
  set "ROOT_DIR=%SCRIPT_DIR%"
) else if exist "%SCRIPT_DIR%\..\..\.env" (
  for %%I in ("%SCRIPT_DIR%\..\..") do set "ROOT_DIR=%%~fI"
) else (
  set "ROOT_DIR=%SCRIPT_DIR%"
)

if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "ENV_FILE=%ROOT_DIR%\.env"
set "COMPOSE_FILE=%ROOT_DIR%\docker-compose.yml"
set "SERVICE_NAME=lms"

if not "%~1"=="" set "COMPOSE_FILE=%~1"
if not "%~2"=="" set "SERVICE_NAME=%~2"

if not exist "%ENV_FILE%" (
  echo Missing env file: %ENV_FILE%
  exit /b 1
)

if not exist "%COMPOSE_FILE%" (
  echo Compose file not found: %COMPOSE_FILE%
  exit /b 1
)

if defined LOGIN_SHARE_IP (
  set "LAN_IP=%LOGIN_SHARE_IP%"
) else (
  call :detect_ip
)

if not defined LAN_IP (
  echo Unable to detect LAN IPv4 address.
  echo Set LOGIN_SHARE_IP and run again.
  exit /b 1
)

call :read_lms_port
if not defined LMS_PORT set "LMS_PORT=3000"

set "LOGIN_URL=http://%LAN_IP%:%LMS_PORT%/login"
set "TMP_FILE=%ENV_FILE%.tmp"
set "FOUND_KEY=0"

> "%TMP_FILE%" (
  for /f "usebackq delims=" %%L in ("%ENV_FILE%") do (
    set "LINE=%%L"
    if /i "!LINE:~0,16!"=="LOGIN_SHARE_URL=" (
      if "!FOUND_KEY!"=="0" (
        echo LOGIN_SHARE_URL="%LOGIN_URL%"
        set "FOUND_KEY=1"
      )
    ) else (
      echo(!LINE!
    )
  )
  if "!FOUND_KEY!"=="0" (
    echo LOGIN_SHARE_URL="%LOGIN_URL%"
  )
)

move /Y "%TMP_FILE%" "%ENV_FILE%" >nul
if errorlevel 1 (
  echo Failed to update %ENV_FILE%
  del /Q "%TMP_FILE%" >nul 2>&1
  exit /b 1
)

echo Updated LOGIN_SHARE_URL=%LOGIN_URL% in %ENV_FILE%
echo Rebuilding service '%SERVICE_NAME%' using %COMPOSE_FILE%...
docker compose -f "%COMPOSE_FILE%" up -d --build --force-recreate "%SERVICE_NAME%"
if errorlevel 1 (
  echo Docker rebuild failed.
  exit /b 1
)

echo Done. Login URL: %LOGIN_URL%
exit /b 0

:read_lms_port
set "LMS_PORT="
for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "KEY=%%A"
  set "VALUE=%%B"
  if /i "!KEY!"=="LMS_HOST_PORT" (
    set "VALUE=!VALUE:"=!"
    set "LMS_PORT=!VALUE!"
  )
)
exit /b 0

:detect_ip
set "LAN_IP="
set "BEST_PRIORITY=99"
set "CURRENT_ADAPTER="

for /f "usebackq delims=" %%L in (`ipconfig`) do (
  set "RAW=%%L"
  set "TRIMMED=!RAW:~0,1!"

  if not "!RAW!"=="" (
    if "!RAW:~-1!"==":" (
      set "CURRENT_ADAPTER=!RAW!"
    ) else (
      echo !RAW! | findstr /I /C:"IPv4 Address" >nul
      if not errorlevel 1 (
        for /f "tokens=2 delims=:" %%A in ("!RAW!") do set "CANDIDATE=%%A"
        set "CANDIDATE=!CANDIDATE: =!"
        if not "!CANDIDATE!"=="" (
          if /I "!CANDIDATE:~0,4!" NEQ "127." if /I "!CANDIDATE:~0,8!" NEQ "169.254." (
            echo !CURRENT_ADAPTER! | findstr /I "docker vEthernet Hyper-V VirtualBox WSL loopback" >nul
            if errorlevel 1 (
              call :ip_priority "!CANDIDATE!" PRIORITY
              if !PRIORITY! LSS !BEST_PRIORITY! (
                set "BEST_PRIORITY=!PRIORITY!"
                set "LAN_IP=!CANDIDATE!"
              )
            )
          )
        )
      )
    )
  )
)
exit /b 0

:ip_priority
setlocal
set "IP=%~1"
set "P=9"

if /I "%IP:~0,8%"=="192.168." set "P=1"
if /I "%IP:~0,3%"=="10." set "P=2"

if /I "%IP:~0,4%"=="172." (
  for /f "tokens=1-4 delims=." %%a in ("%IP%") do (
    set "SECOND=%%b"
  )
  if defined SECOND (
    if !SECOND! GEQ 16 if !SECOND! LEQ 31 set "P=3"
  )
)

endlocal & set "%~2=%P%"
exit /b 0
