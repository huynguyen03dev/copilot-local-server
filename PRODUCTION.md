# GitHub Copilot API Server - Production Guide

## 🚀 Phase 3: Production-Ready Features

This guide covers the advanced production features implemented in Phase 3, including performance optimizations, monitoring, and deployment strategies.

## 📊 Performance Enhancements

### Advanced Streaming Optimizations
- **Backpressure Handling**: Automatic chunk splitting for large responses
- **Memory Management**: Real-time memory monitoring with automatic garbage collection
- **Connection Pooling**: Optimized concurrent stream handling
- **Buffer Management**: Configurable buffer sizes with overflow protection

### Key Performance Features
```typescript
// Automatic backpressure handling
private async writeWithBackpressure(stream, data, streamId) {
  if (data.length > MAX_BUFFER_SIZE) {
    // Split large chunks automatically
    const chunks = this.splitLargeChunk(data)
    for (const chunk of chunks) {
      await stream.writeSSE({ data: chunk })
    }
  }
}

// Real-time memory monitoring
private checkMemoryUsage() {
  const memUsage = process.memoryUsage()
  if (heapUsedMB > 500 && global.gc) {
    global.gc() // Trigger garbage collection
  }
}
```

## 📈 Monitoring & Metrics

### Real-Time Metrics Endpoint
Access comprehensive metrics at `/metrics`:

```json
{
  "uptime": {
    "milliseconds": 3600000,
    "hours": 1.0,
    "human": "1h 0m 0s"
  },
  "streams": {
    "active": 5,
    "maxConcurrent": 200,
    "peakConcurrent": 15,
    "total": 1250,
    "successful": 1200,
    "failed": 50,
    "successRate": 96
  },
  "performance": {
    "totalChunks": 45000,
    "totalBytes": 2500000,
    "averageStreamDuration": 2500,
    "chunksPerSecond": 12.5,
    "bytesPerSecond": 694.4
  },
  "memory": {
    "heapUsed": 125829120,
    "heapTotal": 167772160,
    "rss": 234567890,
    "external": 12345678
  }
}
```

### Monitoring Dashboard
Launch the real-time monitoring dashboard:

```bash
# Start monitoring dashboard
python monitoring-dashboard.py

# Custom server URL
python monitoring-dashboard.py --url http://your-server:8069

# Custom refresh interval
python monitoring-dashboard.py --interval 3
```

**Dashboard Features:**
- 🏥 Server health status
- ⏰ Uptime tracking
- 🔄 Real-time stream statistics
- ⚡ Performance metrics
- 🧠 Memory usage monitoring
- 🚦 Rate limiting status
- 📊 Visual status indicators

## 🔧 Production Configuration

### Environment Variables
```bash
# Server Configuration
NODE_ENV=production
PORT=8069
HOSTNAME=0.0.0.0

# Performance Settings
MAX_STREAMS=200
MAX_BUFFER_SIZE=2097152      # 2MB
RATE_LIMIT_INTERVAL=500      # 500ms
REQUEST_TIMEOUT=300000       # 5 minutes
STREAM_TIMEOUT=600000        # 10 minutes
CHUNK_TIMEOUT=30000          # 30 seconds

# Monitoring
METRICS_ENABLED=true
LOG_LEVEL=info
PERFORMANCE_METRICS=true
MEMORY_CHECK_INTERVAL=30000
CONNECTION_MONITOR_INTERVAL=60000

# Security
ENABLE_CORS=true
ALLOWED_ORIGINS=*
ENABLE_RATE_LIMIT=true
MAX_REQUESTS_PER_MINUTE=100

# Performance Optimization
ENABLE_GC=true
MEMORY_THRESHOLD_MB=1000
ENABLE_COMPRESSION=true
CACHE_HEADERS=true
```

### Production Configuration File
Use `production.config.ts` for advanced configuration:

```typescript
import { getConfig, validateConfig, logConfig } from './production.config'

const config = getConfig()
const errors = validateConfig(config)

if (errors.length > 0) {
  console.error('Configuration errors:', errors)
  process.exit(1)
}

logConfig(config)
```

## 🚀 Deployment

### Automated Deployment
Use the provided deployment script:

```bash
# Make deployment script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh

# Or use npm script
npm run deploy
```

**Deployment Features:**
- ✅ Automated dependency installation
- ✅ Environment configuration
- ✅ systemd service creation
- ✅ Log rotation setup
- ✅ Monitoring configuration
- ✅ Health checks
- ✅ Graceful shutdown handling

### Manual Deployment Steps

1. **Install Dependencies**
   ```bash
   bun install --production
   ```

2. **Build Application**
   ```bash
   bun run build
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env.production
   # Edit .env.production with your settings
   ```

4. **Start Production Server**
   ```bash
   NODE_ENV=production bun run src/index.ts
   ```

### systemd Service
The deployment script creates a systemd service:

```ini
[Unit]
Description=GitHub Copilot API Server
After=network.target

[Service]
Type=simple
User=copilot
WorkingDirectory=/opt/copilot-api-server
Environment=NODE_ENV=production
ExecStart=/home/copilot/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Service Management:**
```bash
# Start service
sudo systemctl start copilot-api

# Enable auto-start
sudo systemctl enable copilot-api

# Check status
sudo systemctl status copilot-api

# View logs
sudo journalctl -u copilot-api -f
```

## 🧪 Performance Testing

### Comprehensive Test Suite
Run the performance test suite:

```bash
# Basic performance test
python performance-test.py

# Custom configuration
python performance-test.py --url http://localhost:8069 --concurrent 20

# Or use npm script
npm run test-performance
```

**Test Categories:**
- 🔄 Concurrent streaming (10+ simultaneous streams)
- 🚦 Rate limiting behavior
- 📊 Large response handling
- ⚠️ Error scenario testing
- 📈 Throughput measurement

### Performance Benchmarks
**Expected Performance (Production Hardware):**
- **Concurrent Streams**: 50-200 simultaneous
- **Response Time**: < 3 seconds average
- **Throughput**: 10-50 chunks/second
- **Success Rate**: > 95%
- **Memory Usage**: < 1GB under load

## 📊 Monitoring & Alerting

### Health Checks
```bash
# Basic health check
curl http://localhost:8069/

# Detailed metrics
curl http://localhost:8069/metrics

# Check specific metrics
curl http://localhost:8069/metrics | jq '.streams.successRate'
```

### Log Monitoring
```bash
# Application logs
tail -f /var/log/copilot-api/access.log
tail -f /var/log/copilot-api/error.log

# System logs
sudo journalctl -u copilot-api -f
```

### Automated Monitoring
The deployment includes automated monitoring:

```bash
# Monitor script runs every 5 minutes
*/5 * * * * /opt/copilot-api-server/monitor.sh
```

## 🔒 Security Considerations

### Production Security
- ✅ CORS configuration
- ✅ Rate limiting
- ✅ Request validation
- ✅ Error handling
- ✅ Resource limits
- ✅ Process isolation

### Recommended Security Settings
```bash
# Firewall configuration
sudo ufw allow 8069/tcp

# Process limits
ulimit -n 65536  # File descriptors
ulimit -u 4096   # Processes
```

## 🚨 Troubleshooting

### Common Issues

**High Memory Usage:**
```bash
# Check memory metrics
curl http://localhost:8069/metrics | jq '.memory'

# Trigger garbage collection
kill -USR2 $(pgrep -f "bun.*copilot")
```

**Connection Issues:**
```bash
# Check active connections
ss -tulpn | grep :8069

# Check service status
systemctl status copilot-api
```

**Performance Issues:**
```bash
# Run performance test
python performance-test.py

# Check system resources
htop
iostat -x 1
```

## 📈 Scaling Recommendations

### Horizontal Scaling
- Use load balancer (nginx, HAProxy)
- Deploy multiple instances
- Implement session affinity for streaming

### Vertical Scaling
- Increase `MAX_STREAMS` for more concurrent connections
- Adjust `MAX_BUFFER_SIZE` for larger responses
- Optimize `MEMORY_THRESHOLD_MB` based on available RAM

### Performance Tuning
```bash
# Optimize for high concurrency
export MAX_STREAMS=500
export RATE_LIMIT_INTERVAL=100
export MAX_BUFFER_SIZE=4194304  # 4MB

# Optimize for low latency
export CHUNK_TIMEOUT=10000      # 10 seconds
export STREAM_TIMEOUT=300000    # 5 minutes
```

## 🎯 Next Steps

1. **Monitor Performance**: Use the monitoring dashboard regularly
2. **Tune Configuration**: Adjust settings based on your workload
3. **Scale as Needed**: Add more instances or resources
4. **Update Regularly**: Keep dependencies and server updated
5. **Backup Configuration**: Save your production settings

For support and updates, check the project repository and documentation.
