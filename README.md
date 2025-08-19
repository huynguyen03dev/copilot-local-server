# VS Code Copilot API Server

> **⚠️ EDUCATIONAL PURPOSE ONLY**
> This project is for educational and learning purposes only. It demonstrates API proxy patterns, authentication flows, and performance optimization techniques. Not intended for production use.

A local API server that exposes GitHub Copilot as an OpenAI-compatible endpoint for educational exploration of API integration patterns.

## ✨ Features

- **OpenAI-Compatible API** - Educational example of API compatibility layers
- **GitHub OAuth Flow** - Learn device flow authentication patterns
- **Performance Optimizations** - Connection pooling, caching, compression
- **Local Development** - Safe learning environment on your machine
- **Cross-Platform** - Works on Windows, macOS, and Linux

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/) runtime
- Active GitHub Copilot subscription
- Basic understanding of APIs and authentication

### Installation
```bash
git clone <repository>
cd vscode-api-server
bun install
```

### One-Click Startup
**Windows:** `start.bat`
**macOS/Linux:** `./start.sh`

**Or manually:**
```bash
# Authenticate and start in one command
bun run src/index.ts --auto-auth

# Or step by step
bun run auth        # Authenticate with GitHub
bun run start       # Start the server
```

Server runs on `http://localhost:8069` by default.

## 📚 Learning Objectives

This project demonstrates:
- **API Proxy Patterns** - How to create compatibility layers between different APIs
- **OAuth Device Flow** - Modern authentication for CLI/desktop applications
- **Performance Optimization** - Connection pooling, caching, and compression techniques
- **Error Handling** - Circuit breakers, retries, and graceful degradation
- **TypeScript Architecture** - Clean, type-safe API server design

## 🔧 Usage Examples

### Basic API Call
```bash
curl -X POST http://localhost:8069/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### With Python
```python
import openai
client = openai.OpenAI(
    api_key="dummy-key",
    base_url="http://localhost:8069/v1"
)
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello from Python!"}]
)
```

## ⚙️ Configuration

Basic configuration via environment variables:
```bash
PORT=8069                    # Server port
HOSTNAME=127.0.0.1          # Bind address
LOG_LEVEL=info              # debug, info, warn, error
NODE_ENV=development        # Environment mode
```

## 🔍 Key API Endpoints

- `POST /v1/chat/completions` - Main chat endpoint (OpenAI-compatible)
- `GET /v1/models` - List available models
- `GET /auth/status` - Check authentication status
- `GET /` - Health check and server info

## 🛠️ Development

```bash
bun run dev          # Development with auto-reload
bun run build        # Build for production
bun run type-check   # TypeScript validation
```

## 🔒 Security & Disclaimers

**Educational Use Only:**
- This project is for learning API patterns and authentication flows
- Not intended for production or commercial use
- Demonstrates proxy server architecture and performance optimization

**Security Notes:**
- Tokens stored locally in `.auth.json` (restricted permissions)
- Server binds to localhost by default
- Uses GitHub's internal API endpoints (subject to change)

**Compliance:**
- Ensure compliance with GitHub's Terms of Service
- Requires active GitHub Copilot subscription
- Use responsibly and respect rate limits

## 🚨 Troubleshooting

**Authentication Issues:**
```bash
# Clear and re-authenticate
bun run clear-auth
bun run auth
```

**Common Problems:**
- **"Not authenticated"** → Run `bun run auth`
- **"Connection refused"** → Check if server is running
- **"Token expired"** → Server auto-refreshes, or re-authenticate

## 📄 License

MIT License - Educational use encouraged.

---

**⚠️ Important:** This project uses GitHub's internal Copilot API endpoints for educational purposes. These endpoints are not officially documented and may change. Always ensure compliance with GitHub's Terms of Service.
