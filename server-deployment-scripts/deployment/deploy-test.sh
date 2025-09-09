#!/bin/bash
#
# Test environment deployment script template
# This script should be customized for each service
#

set -e

SERVICE_NAME=$1
DEPLOY_BASE=$2

if [[ -z "$SERVICE_NAME" || -z "$DEPLOY_BASE" ]]; then
    echo "Usage: $0 <service_name> <deploy_base>"
    exit 1
fi

SERVICE_DIR="$DEPLOY_BASE/$SERVICE_NAME"
BUILD_DIR="$(pwd)"

echo "=== Test Environment Deployment for $SERVICE_NAME ==="
echo "Build directory: $BUILD_DIR"
echo "Deploy directory: $SERVICE_DIR"

# Stop existing service if running
echo "Stopping existing service..."
systemctl stop "${SERVICE_NAME}-test" 2>/dev/null || true

# Create service directory if not exists
mkdir -p "$SERVICE_DIR"

echo "=== Building Service ==="

# Check service type and build accordingly
if [[ -f "go.mod" ]]; then
    echo "Detected Go service, building..."
    
    # Install dependencies
    go mod download
    go mod tidy
    
    # Run tests
    echo "Running tests..."
    go test ./... -v
    
    # Build binary
    echo "Building binary..."
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o "$SERVICE_DIR/$SERVICE_NAME" ./cmd/server
    
    # Copy configuration files
    if [[ -d "conf" ]]; then
        cp -r conf "$SERVICE_DIR/"
    fi
    
elif [[ -f "package.json" ]]; then
    echo "Detected Node.js service, building..."
    
    # Install dependencies
    npm ci --production
    
    # Run tests
    echo "Running tests..."
    npm test
    
    # Copy files
    cp -r . "$SERVICE_DIR/"
    cd "$SERVICE_DIR" && npm ci --production
    
else
    echo "Unknown service type, copying files..."
    cp -r . "$SERVICE_DIR/"
fi

# Set permissions
chmod +x "$SERVICE_DIR/$SERVICE_NAME" 2>/dev/null || true

# Copy or create systemd service file
if [[ -f "${SERVICE_NAME}-test.service" ]]; then
    echo "Installing systemd service file..."
    cp "${SERVICE_NAME}-test.service" "/etc/systemd/system/"
    systemctl daemon-reload
else
    echo "Creating default systemd service file..."
    cat > "/etc/systemd/system/${SERVICE_NAME}-test.service" << EOF
[Unit]
Description=${SERVICE_NAME} Test Service
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=$SERVICE_DIR
ExecStart=$SERVICE_DIR/$SERVICE_NAME
Restart=always
RestartSec=5
Environment=ENV=test

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
fi

echo "=== Starting Service ==="

# Start the service
systemctl enable "${SERVICE_NAME}-test"
systemctl start "${SERVICE_NAME}-test"

# Wait for service to start
sleep 5

# Check if service is running
if systemctl is-active --quiet "${SERVICE_NAME}-test"; then
    echo "Service started successfully"
else
    echo "ERROR: Service failed to start"
    journalctl -u "${SERVICE_NAME}-test" --no-pager -n 20
    exit 1
fi

echo "=== Test Deployment Completed ==="