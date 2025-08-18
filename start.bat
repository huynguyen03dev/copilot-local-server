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

REM Check authentication status first
echo [?] Checking authentication status...
bun run test-auth.js >nul 2>&1

if %errorlevel% equ 0 (
    echo [OK] Already authenticated with GitHub Copilot
    echo.
) else (
    echo [!] Not authenticated with GitHub Copilot
    echo [*] Starting seamless authentication and server...
    echo.

    REM Use the --auto-auth flag for seamless experience
    bun run src/index.ts --auto-auth %*
    exit /b %errorlevel%
)

REM If we reach here, user is already authenticated, so start normally
echo [*] Starting GitHub Copilot API Server...

REM Try to read PORT from .env file if it exists and PORT is not already set
if not defined PORT (
    if exist .env (
        for /f "tokens=2 delims==" %%a in ('findstr "^PORT=" .env 2^>nul') do set PORT=%%a
    )
    if not defined PORT set PORT=8069
)
echo    - Server will be available at: http://localhost:%PORT%
echo    - API endpoint: http://localhost:%PORT%/v1/chat/completions
echo    - Press Ctrl+C to stop
echo.

bun run src/index.ts %*
