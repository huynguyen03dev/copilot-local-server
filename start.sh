#!/bin/bash

# GitHub Copilot API Server Startup Script

set -e

echo "[*] GitHub Copilot API Server"
echo "=============================="
echo

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "[X] Bun is not installed. Please install it first:"
    echo "   curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "[X] Please run this script from the vscode-api-server directory"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[+] Installing dependencies..."
    bun install
    echo
fi

# Check authentication status
echo "[?] Checking authentication status..."
if bun run test-auth.js >/dev/null 2>&1; then
    echo "[OK] Already authenticated with GitHub Copilot"
    echo
else
    echo "[!] Not authenticated with GitHub Copilot"
    echo "[*] Starting seamless authentication and server..."
    echo

    # Use the --auto-auth flag for seamless experience
    exec bun run src/index.ts --auto-auth "$@"
fi

# If we reach here, user is already authenticated, so start normally
echo "[*] Starting GitHub Copilot API Server..."

# Try to read PORT from .env file if it exists and PORT is not already set
if [ -z "$PORT" ] && [ -f ".env" ]; then
    PORT=$(grep "^PORT=" .env 2>/dev/null | cut -d'=' -f2)
fi
# Use default if still not set
PORT=${PORT:-8069}
echo "   - Server will be available at: http://localhost:${PORT}"
echo "   - API endpoint: http://localhost:${PORT}/v1/chat/completions"
echo "   - Press Ctrl+C to stop"
echo

exec bun run src/index.ts "$@"
