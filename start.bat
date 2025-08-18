@echo off
setlocal enabledelayedexpansion

echo [*] GitHub Copilot API Server
echo ==============================
echo.

REM Check if bun is installed
where bun >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Bun is not installed. Please install it first:
    echo    https://bun.sh/
    pause
    exit /b 1
)

REM Check if we're in the right directory
if not exist "package.json" (
    echo [X] Please run this script from the vscode-api-server directory
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist "node_modules" (
    echo [+] Installing dependencies...
    bun install
    echo.
)

REM Load environment variables from .env file FIRST
echo [*] Loading configuration...
call :load_env_vars

REM Display configuration
echo    - Port: %PORT%
echo    - Hostname: %HOSTNAME%
echo    - Log Level: %LOG_LEVEL%
echo    - Node Environment: %NODE_ENV%
echo.

REM Check authentication status using proper method
echo [?] Checking authentication status...
bun run -e "import {GitHubCopilotAuth} from './src/auth.js'; const auth = await GitHubCopilotAuth.isAuthenticated(); process.exit(auth ? 0 : 1);" >nul 2>&1

if %errorlevel% equ 0 (
    echo [OK] Already authenticated with GitHub Copilot
    echo.
    goto :start_server
) else (
    echo [!] Not authenticated with GitHub Copilot
    echo [*] Starting seamless authentication and server...
    echo.

    REM Pass all environment variables to the auto-auth process
    bun run src/index.ts --auto-auth %*
    exit /b %errorlevel%
)

:start_server
echo [*] Starting GitHub Copilot API Server...
echo    - Server will be available at: http://%HOSTNAME%:%PORT%
echo    - API endpoint: http://%HOSTNAME%:%PORT%/v1/chat/completions
echo    - Auth status: http://%HOSTNAME%:%PORT%/auth/status
echo    - Available models: http://%HOSTNAME%:%PORT%/v1/models
echo    - Metrics: http://%HOSTNAME%:%PORT%/metrics
echo    - Press Ctrl+C to stop
echo.

REM Start server with all loaded environment variables
bun run src/index.ts %*
goto :eof

:load_env_vars
REM Set defaults first
if not defined PORT set PORT=8069
if not defined HOSTNAME set HOSTNAME=127.0.0.1
if not defined LOG_LEVEL set LOG_LEVEL=info
if not defined NODE_ENV set NODE_ENV=development
if not defined MAX_STREAMS set MAX_STREAMS=100
if not defined MAX_BUFFER_SIZE set MAX_BUFFER_SIZE=1048576
if not defined LOG_COLORS set LOG_COLORS=true
if not defined LOG_CATEGORIES set LOG_CATEGORIES=true
if not defined ENABLE_PROGRESS_LOGS set ENABLE_PROGRESS_LOGS=true
if not defined ENABLE_ENDPOINT_LOGS set ENABLE_ENDPOINT_LOGS=true
if not defined ENABLE_MODEL_LOGS set ENABLE_MODEL_LOGS=true
if not defined ENABLE_MEMORY_LOGS set ENABLE_MEMORY_LOGS=true

REM Load from .env file if it exists
if exist .env (
    echo    - Loading from .env file...
    for /f "usebackq eol=# tokens=1,2 delims==" %%a in (".env") do (
        if not "%%a"=="" if not "%%b"=="" (
            REM Remove any trailing spaces from value
            for /f "tokens=1" %%c in ("%%b") do (
                set "%%a=%%c"
                echo      * Loaded %%a=%%c
            )
        )
    )
    echo    - Environment variables loaded successfully
) else (
    echo    - No .env file found, using defaults
)

REM Validate critical settings
if not defined PORT set PORT=8069
if not defined HOSTNAME set HOSTNAME=127.0.0.1

goto :eof
