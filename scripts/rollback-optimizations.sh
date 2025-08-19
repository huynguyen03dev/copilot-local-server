#!/bin/bash

# Emergency Rollback Script for Performance Optimizations
# Disables all performance optimizations and reverts to original behavior

echo "🚨 Emergency Rollback: Disabling Performance Optimizations"

# Create rollback environment file
cat > .env.rollback << EOF
# Performance Optimization Rollback Configuration
ENABLE_ENDPOINT_CACHE=false
ENABLE_TOKEN_CACHE=false
ENABLE_CONNECTION_POOLING=false

# Revert to conservative settings
MAX_STREAMS=50
REQUEST_TIMEOUT=60000
STREAM_TIMEOUT=120000
MAX_BUFFER_SIZE=524288

# Enable verbose logging for debugging
LOG_LEVEL=debug
ENABLE_PROGRESS_LOGS=true
ENABLE_ENDPOINT_LOGS=true

# Disable advanced features
ENABLE_COMPRESSION=false
CACHE_HEADERS=false
ENABLE_GC=false

EOF

echo "✅ Rollback configuration created: .env.rollback"
echo "📋 To apply rollback:"
echo "   1. Stop the server: pkill -f 'bun.*index.ts'"
echo "   2. Backup current .env: cp .env .env.backup"
echo "   3. Apply rollback: cp .env.rollback .env"
echo "   4. Restart server: bun run start"
echo ""
echo "📋 To restore optimizations:"
echo "   1. Stop the server: pkill -f 'bun.*index.ts'"
echo "   2. Restore .env: cp .env.backup .env"
echo "   3. Restart server: bun run start"

# Make script executable
chmod +x scripts/rollback-optimizations.sh
