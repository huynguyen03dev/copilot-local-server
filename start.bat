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
bun run -e "import { GitHubCopilotAuth } from './src/auth.ts'; const isAuth = await GitHubCopilotAuth.isAuthenticated(); process.exit(isAuth ? 0 : 1);" >nul 2>&1

if %errorlevel% equ 0 (
    echo [OK] Already authenticated with GitHub Copilot
    echo.
) else (
    echo [!] Not authenticated with GitHub Copilot
    echo.
    echo To authenticate:
    echo   1. Run: bun run auth
    echo   2. Follow the instructions to authenticate with GitHub
    echo   3. Then start the server with: bun run start
    echo.

    set /p choice="Would you like to start authentication now? (y/N): "
    if /i "%choice%"=="y" (
        echo Starting authentication flow...
        bun run src/index.ts --auth
        echo.
        echo Authentication complete! Now starting server...
        echo.
    )
)

echo [*] Starting GitHub Copilot API Server...
echo    - Server will be available at: http://localhost:8069
echo    - API endpoint: http://localhost:8069/v1/chat/completions
echo    - Press Ctrl+C to stop
echo.

bun run src/index.ts %*
