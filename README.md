# VS Code Copilot API Server

A local API server that exposes GitHub Copilot as an OpenAI-compatible endpoint. This allows you to use GitHub Copilot with any application that supports the OpenAI API format.

## Features

- **GitHub OAuth Authentication** - Secure device flow authentication
- **OpenAI-Compatible API** - Drop-in replacement for OpenAI API
- **Local Server** - Runs entirely on your machine
- **Chat Completions** - Full support for chat-based interactions
- **Token Management** - Automatic token refresh and caching
- **CORS Support** - Ready for web applications
- **Cross-Platform** - Works on Windows, macOS, and Linux
- **Smart Authentication** - Remembers authentication between sessions

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Active GitHub Copilot subscription
- VS Code with Copilot extension (recommended)

## Installation

1. Clone or download this folder
2. Install dependencies:
   ```bash
   cd vscode-api-server
   bun install
   ```

## Quick Start

### Method 1: One-Click Startup (Recommended) 🚀

**Windows:**
```batch
start.bat
```

**macOS/Linux:**
```bash
./start.sh
```

**✨ Completely Automated Experience:**
- ✅ Checks if Bun is installed
- ✅ Installs dependencies automatically
- ✅ Detects authentication status
- ✅ **Automatically opens browser for GitHub OAuth**
- ✅ **Handles entire authentication flow seamlessly**
- ✅ Starts server immediately after authentication
- ✅ **No manual steps required!**

Just run the script and your browser will open for authentication. The server starts automatically once you approve the GitHub OAuth request.

### Method 2: Seamless Command Line

```bash
# One command that handles everything automatically
bun run src/index.ts --auto-auth
```

This will:
- ✅ Check authentication status
- ✅ Open browser for OAuth if needed
- ✅ Wait for authentication completion
- ✅ Start server immediately

### Method 3: Manual Steps (Traditional)

```bash
# Step 1: Authenticate (only needed once)
bun run auth

# Step 2: Start the server
bun run start
```

### Method 4: Individual Commands

```bash
# Interactive authentication
bun run src/index.ts --auth

# Start server (will warn if not authenticated)
bun run src/index.ts
```

## Authentication

The authentication process:
- Uses GitHub's OAuth device flow
- Generates a device code (valid for 15 minutes)
- Shows you a GitHub URL to visit
- Provides a user code to enter
- Waits for completion with progress indicator
- Automatically handles token refresh
- Remembers authentication between sessions

**Authentication Features**:
- **Extended timeout**: Up to 15 minutes to complete
- **Progress indicator**: Shows remaining time and attempts
- **Auto-retry**: Handles temporary network issues
- **Smart error handling**: Specific error messages with solutions
- **Persistent sessions**: No need to re-authenticate every time

The server will start on `http://localhost:8069` by default. You can customize the port by:
- Setting `PORT=3000` in a `.env` file
- Using command line: `bun run src/index.ts --port=3000`
- Setting environment variable: `PORT=3000 bun run src/index.ts`

## Available Scripts

```bash
# Development
bun run dev          # Start with auto-reload
bun run start        # Start production server
bun run build        # Build for production

# Authentication
bun run auth         # Authenticate with GitHub
bun run clear-auth   # Clear stored credentials

# Testing & Utilities
bun run test         # Run test client
bun run test-endpoint # Test endpoint detection
bun run type-check   # Check TypeScript types
```

## Using the API

You can now use any OpenAI-compatible client to interact with GitHub Copilot:

> **Note**: Examples below use port `8069` (default). Replace with your configured port if different.

```bash
curl -X POST http://localhost:8069/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ]
  }'
```

## API Endpoints

### Authentication Endpoints

- `GET /auth/status` - Check authentication status
- `POST /auth/start` - Start authentication flow
- `POST /auth/poll` - Poll for authentication completion
- `POST /auth/clear` - Clear stored authentication

### OpenAI-Compatible Endpoints

- `POST /v1/chat/completions` - Chat completions (main endpoint)
- `GET /v1/models` - List available models

### Utility Endpoints

- `GET /` - Health check and server info

## Configuration

### Environment Variables

The server can be configured using environment variables. Copy `.env.example` to `.env` and customize as needed:

```bash
# Server Configuration
PORT=8069
HOSTNAME=127.0.0.1

# Performance Settings
MAX_STREAMS=100
MAX_BUFFER_SIZE=1048576
REQUEST_TIMEOUT=300000

# Development Settings
NODE_ENV=development

# Enhanced Logging Configuration
LOG_LEVEL=info                    # debug, info, warn, error, silent
LOG_COLORS=true                   # Enable colored output
LOG_TIMESTAMPS=false              # Include timestamps in logs
LOG_CATEGORIES=true               # Show log categories [STREAM], [ENDPOINT], etc.
CHUNK_LOG_FREQUENCY=0             # 0=adaptive, >0=fixed frequency
ENABLE_PROGRESS_LOGS=true         # Stream progress logging
ENABLE_ENDPOINT_LOGS=true         # Endpoint discovery logging
ENABLE_MODEL_LOGS=true            # Model information logging
ENABLE_MEMORY_LOGS=true           # Memory usage logging
```

**Configuration Priority** (highest to lowest):
1. Command line arguments (`--port=8080`)
2. Environment variables (`PORT=8080` or `.env` file)
3. Default values (`8069`)

### Enhanced Logging System

The server includes a sophisticated logging system optimized for different environments:

**Log Levels:**
- `debug` - Verbose logging for development (shows all endpoint attempts, frequent progress updates)
- `info` - Standard logging for production (essential information, moderate progress updates)
- `warn` - Warnings and errors only (minimal logging for critical production)
- `error` - Errors only
- `silent` - No logging

**Milestone-Based Chunk Logging:**
- **Development (`debug`)**: Milestones (10, 25, 50, 100, 250, 500, 1000) + percentages for large streams
- **Production (`info`)**: Major milestones only (≥100 chunks)
- **Critical (`warn`)**: No progress logging
- **Custom**: Set `CHUNK_LOG_FREQUENCY=50` for fixed frequency

**Environment-Specific Configurations:**
```bash
# Development (verbose)
cp .env.development .env

# Production (balanced)
cp .env.production .env

# Critical Production (minimal)
cp .env.production.minimal .env
```

**Before vs After Logging (625-chunk example):**
```bash
# Before: 625 chunks = 25+ log lines
🔍 [ENDPOINT] Trying streaming request to: https://...
🔍 [ENDPOINT] ❌ 404 for endpoint: https://..., trying next...
ℹ️ [ENDPOINT] ✅ Success with endpoint: https://...
ℹ️ [MODEL] 🤖 Stream stream-123 using model: gpt-4o-2024-11-20
🔍 [PROGRESS] 📊 Stream stream-123: 25 chunks processed
🔍 [PROGRESS] 📊 Stream stream-123: 50 chunks processed
[... 23 more progress lines ...]

# After: 625 chunks = 7 essential lines
📈 Stream stream-123 started. Active: 1/100
✅ Using endpoint: https://api.individual.githubcopilot.com/chat/completions
📊 Stream stream-123: 25% complete (156/625)
📊 Stream stream-123: 50% complete (312/625)
📊 Stream stream-123: 75% complete (468/625)
✅ Stream completed: 625 chunks in 45s (14/sec) - gpt-4o-2024-11-20
📉 Stream stream-123 ended. Active: 0/100
```

### Command Line Options

```bash
bun run src/index.ts [options]

Options:
  --port=<number>     Port to listen on (default: 8069, or PORT env var)
  --host=<string>     Hostname to bind to (default: 127.0.0.1, or HOSTNAME env var)
  --auth              Start interactive authentication flow
  --clear-auth        Clear stored authentication
  --help, -h          Show help message
```

### Examples

```bash
# Start server with default settings (uses .env file)
bun run src/index.ts

# Start server on custom port via command line
bun run src/index.ts --port=8080

# Start server on custom port via environment variable
PORT=3000 bun run src/index.ts

# Bind to all interfaces
bun run src/index.ts --host=0.0.0.0

# Set up custom configuration
cp .env.example .env
# Edit .env with your settings
bun run src/index.ts

# Clear authentication and start fresh
bun run src/index.ts --clear-auth
bun run src/index.ts --auth
```

## Usage Examples

### With curl

> **Note**: Replace `8069` with your configured port if different.

```bash
# Chat completion
curl -X POST http://localhost:8069/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain quantum computing"}
    ],
    "temperature": 0.7,
    "max_tokens": 150
  }'

# List models
curl http://localhost:8069/v1/models

# Check auth status
curl http://localhost:8069/auth/status
```

### With Python (OpenAI library)

> **Note**: Replace `8069` with your configured port if different.

```python
import openai

# Configure client to use local server
client = openai.OpenAI(
    api_key="dummy-key",  # Not used, but required by library
    base_url="http://localhost:8069/v1"
)

# Use like normal OpenAI API
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Hello from Python!"}
    ]
)

print(response.choices[0].message.content)
```

### With JavaScript/Node.js

> **Note**: Replace `8069` with your configured port if different.

```javascript
const response = await fetch('http://localhost:8069/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Hello from JavaScript!' }
    ]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

## Development

### Run in Development Mode

```bash
bun run dev
```

This will start the server with auto-reload on file changes.

### Build for Production

```bash
bun run build
```

### Type Checking

```bash
bun run type-check
```

## Security Considerations

- Authentication tokens are stored in `.auth.json` with restricted permissions (600)
- The server binds to localhost by default for security
- CORS is enabled but can be configured for your needs
- Never expose this server directly to the internet without proper security measures

## Troubleshooting

### Authentication Issues

1. **"Not authenticated"** - Run `bun run auth` or use the startup scripts
2. **"Authentication timed out"** - You have 15 minutes to complete the process. Run `bun run auth` again for a fresh code
3. **"Access denied"** - Make sure to click "Authorize" on GitHub. Run `bun run clear-auth && bun run auth` to retry
4. **"Token expired"** - The server automatically refreshes tokens, but you may need to re-authenticate
5. **"Failed to get device code"** - Check your internet connection and GitHub status

**Startup Scripts Handle Authentication Automatically:**
- The `start.bat` (Windows) and `start.sh` (Linux/macOS) scripts check authentication status first
- They only prompt for authentication if you're not already authenticated
- This provides a consistent experience across different startup methods

**For detailed troubleshooting, see [AUTHENTICATION_GUIDE.md](./AUTHENTICATION_GUIDE.md)**

### API Issues

1. **"Copilot API error"** - Ensure you have an active Copilot subscription
2. **"Connection refused"** - Make sure the server is running
3. **"CORS errors"** - Check the CORS configuration in `src/server.ts`

### Clear Everything and Start Fresh

```bash
bun run src/index.ts --clear-auth
rm -f .auth.json
bun run src/index.ts --auth
```

## License

MIT License - feel free to modify and use as needed.

## Disclaimer

This project uses GitHub's internal Copilot API endpoints. These are not officially documented and may change without notice. Use at your own risk and ensure compliance with GitHub's Terms of Service.
