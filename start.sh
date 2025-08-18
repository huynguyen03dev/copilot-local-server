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
AUTH_STATUS=$(bun run -e "
    import { GitHubCopilotAuth } from './src/auth.ts';
    const isAuth = await GitHubCopilotAuth.isAuthenticated();
    console.log(isAuth ? 'authenticated' : 'not-authenticated');
" 2>/dev/null || echo "unknown")

if [ "$AUTH_STATUS" = "authenticated" ]; then
    echo "[OK] Already authenticated with GitHub Copilot"
    echo
elif [ "$AUTH_STATUS" = "not-authenticated" ]; then
    echo "[!] Not authenticated with GitHub Copilot"
    echo
    echo "To authenticate:"
    echo "  1. Run: bun run auth"
    echo "  2. Follow the instructions to authenticate with GitHub"
    echo "  3. Then start the server with: bun run start"
    echo

    read -p "Would you like to start authentication now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Starting authentication flow..."
        bun run src/index.ts --auth
        echo
        echo "Authentication complete! Now starting server..."
        echo
    fi
else
    echo "[!] Could not check authentication status"
    echo
fi

# Start the server
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
