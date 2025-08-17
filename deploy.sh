#!/bin/bash

# GitHub Copilot API Server - Production Deployment Script
# Optimized for performance, monitoring, and reliability

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="copilot-api-server"
APP_DIR="/opt/copilot-api-server"
SERVICE_NAME="copilot-api"
LOG_DIR="/var/log/copilot-api"
USER="copilot"
PORT="${PORT:-8069}"
NODE_ENV="${NODE_ENV:-production}"

echo -e "${BLUE}🚀 GitHub Copilot API Server - Production Deployment${NC}"
echo "=================================================="

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ This script should not be run as root for security reasons${NC}"
   exit 1
fi

# Function to print status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    print_error "Bun is not installed. Please install Bun first:"
    echo "curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
print_status "Bun is installed"

# Check if Git is installed
if ! command -v git &> /dev/null; then
    print_error "Git is not installed. Please install Git first."
    exit 1
fi
print_status "Git is installed"

# Check if systemd is available
if ! command -v systemctl &> /dev/null; then
    print_warning "systemd is not available. Service management will be manual."
    USE_SYSTEMD=false
else
    USE_SYSTEMD=true
    print_status "systemd is available"
fi

# Create application directory
echo -e "${BLUE}📁 Setting up application directory...${NC}"
sudo mkdir -p "$APP_DIR"
sudo mkdir -p "$LOG_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"
sudo chown -R "$USER:$USER" "$LOG_DIR"
print_status "Application directories created"

# Clone or update repository
echo -e "${BLUE}📦 Deploying application code...${NC}"
if [ -d "$APP_DIR/.git" ]; then
    echo "Updating existing repository..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "Cloning repository..."
    git clone https://github.com/your-username/vscode-api-server.git "$APP_DIR"
    cd "$APP_DIR"
fi
print_status "Application code deployed"

# Install dependencies
echo -e "${BLUE}📚 Installing dependencies...${NC}"
bun install --production
print_status "Dependencies installed"

# Build application
echo -e "${BLUE}🔨 Building application...${NC}"
bun run build
print_status "Application built"

# Create environment file
echo -e "${BLUE}⚙️  Setting up environment configuration...${NC}"
cat > "$APP_DIR/.env.production" << EOF
# Production Environment Configuration
NODE_ENV=production
PORT=$PORT
HOSTNAME=0.0.0.0

# Performance Settings
MAX_STREAMS=200
MAX_BUFFER_SIZE=2097152
RATE_LIMIT_INTERVAL=500
REQUEST_TIMEOUT=300000
STREAM_TIMEOUT=600000
CHUNK_TIMEOUT=30000

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
EOF
print_status "Environment configuration created"

# Create systemd service file (if systemd is available)
if [ "$USE_SYSTEMD" = true ]; then
    echo -e "${BLUE}🔧 Creating systemd service...${NC}"
    sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null << EOF
[Unit]
Description=GitHub Copilot API Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
EnvironmentFile=$APP_DIR/.env.production
ExecStart=/home/$USER/.bun/bin/bun run src/index.ts
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/access.log
StandardError=append:$LOG_DIR/error.log

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR $LOG_DIR

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable $SERVICE_NAME
    print_status "systemd service created and enabled"
fi

# Create log rotation configuration
echo -e "${BLUE}📝 Setting up log rotation...${NC}"
sudo tee /etc/logrotate.d/$SERVICE_NAME > /dev/null << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        systemctl reload $SERVICE_NAME > /dev/null 2>&1 || true
    endscript
}
EOF
print_status "Log rotation configured"

# Create monitoring script
echo -e "${BLUE}📊 Setting up monitoring...${NC}"
cat > "$APP_DIR/monitor.sh" << 'EOF'
#!/bin/bash
# Simple monitoring script for GitHub Copilot API Server

SERVICE_NAME="copilot-api"
LOG_FILE="/var/log/copilot-api/monitor.log"

check_service() {
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo "$(date): Service is running" >> $LOG_FILE
        return 0
    else
        echo "$(date): Service is down, attempting restart" >> $LOG_FILE
        systemctl restart $SERVICE_NAME
        return 1
    fi
}

check_health() {
    if curl -f -s http://localhost:8069/ > /dev/null; then
        echo "$(date): Health check passed" >> $LOG_FILE
        return 0
    else
        echo "$(date): Health check failed" >> $LOG_FILE
        return 1
    fi
}

# Run checks
check_service
sleep 5
check_health

# Check memory usage
MEMORY_USAGE=$(ps -o pid,ppid,cmd,%mem,%cpu --sort=-%mem -C bun | head -2 | tail -1 | awk '{print $4}')
if (( $(echo "$MEMORY_USAGE > 80" | bc -l) )); then
    echo "$(date): High memory usage detected: $MEMORY_USAGE%" >> $LOG_FILE
fi
EOF

chmod +x "$APP_DIR/monitor.sh"
print_status "Monitoring script created"

# Create cron job for monitoring
echo -e "${BLUE}⏰ Setting up monitoring cron job...${NC}"
(crontab -l 2>/dev/null; echo "*/5 * * * * $APP_DIR/monitor.sh") | crontab -
print_status "Monitoring cron job created"

# Start the service
echo -e "${BLUE}🚀 Starting the service...${NC}"
if [ "$USE_SYSTEMD" = true ]; then
    sudo systemctl start $SERVICE_NAME
    sleep 3
    
    if sudo systemctl is-active --quiet $SERVICE_NAME; then
        print_status "Service started successfully"
    else
        print_error "Failed to start service"
        echo "Check logs: sudo journalctl -u $SERVICE_NAME -f"
        exit 1
    fi
else
    print_warning "Manual service management required"
    echo "To start the service manually:"
    echo "cd $APP_DIR && NODE_ENV=production bun run src/index.ts"
fi

# Final health check
echo -e "${BLUE}🏥 Performing health check...${NC}"
sleep 5
if curl -f -s "http://localhost:$PORT/" > /dev/null; then
    print_status "Health check passed"
else
    print_warning "Health check failed - service may still be starting"
fi

# Display deployment summary
echo ""
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo "=================================================="
echo "Service: $SERVICE_NAME"
echo "Port: $PORT"
echo "Logs: $LOG_DIR"
echo "Config: $APP_DIR/.env.production"
echo ""
echo "Useful commands:"
if [ "$USE_SYSTEMD" = true ]; then
    echo "  Start:   sudo systemctl start $SERVICE_NAME"
    echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
    echo "  Restart: sudo systemctl restart $SERVICE_NAME"
    echo "  Status:  sudo systemctl status $SERVICE_NAME"
    echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
fi
echo "  Monitor: python3 $APP_DIR/monitoring-dashboard.py"
echo "  Metrics: curl http://localhost:$PORT/metrics"
echo "  Health:  curl http://localhost:$PORT/"
echo ""
echo -e "${BLUE}📊 Access the monitoring dashboard:${NC}"
echo "python3 $APP_DIR/monitoring-dashboard.py --url http://localhost:$PORT"
