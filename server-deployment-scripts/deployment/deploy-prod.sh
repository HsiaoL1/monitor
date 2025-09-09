#!/bin/bash
#
# Production environment deployment script template
# This script should be customized for each service with additional safety checks
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
TEMP_SERVICE_DIR="${SERVICE_DIR}.new"

echo "=== Production Environment Deployment for $SERVICE_NAME ==="
echo "Build directory: $BUILD_DIR"
echo "Deploy directory: $SERVICE_DIR"
echo "Temp directory: $TEMP_SERVICE_DIR"

# Create temporary directory for new version
rm -rf "$TEMP_SERVICE_DIR"
mkdir -p "$TEMP_SERVICE_DIR"

echo "=== Building Service ==="

# Check service type and build accordingly
if [[ -f "go.mod" ]]; then
    echo "Detected Go service, building..."
    
    # Install dependencies
    go mod download
    go mod tidy
    
    # Run tests with coverage
    echo "Running tests with coverage..."
    go test ./... -v -coverprofile=coverage.out
    
    # Check test coverage (optional, uncomment if needed)
    # COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print substr($3, 1, length($3)-1)}')
    # if (( $(echo "$COVERAGE < 80" | bc -l) )); then
    #     echo "ERROR: Test coverage $COVERAGE% is below required 80%"
    #     exit 1
    # fi
    
    # Build optimized binary for production
    echo "Building optimized production binary..."
    CGO_ENABLED=0 GOOS=linux go build \
        -ldflags="-w -s -X main.version=$(git describe --tags --always) -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        -o "$TEMP_SERVICE_DIR/$SERVICE_NAME" ./cmd/server
    
    # Copy configuration files
    if [[ -d "conf" ]]; then
        cp -r conf "$TEMP_SERVICE_DIR/"
    fi
    
elif [[ -f "package.json" ]]; then
    echo "Detected Node.js service, building..."
    
    # Install dependencies
    npm ci --production
    
    # Run tests
    echo "Running tests..."
    npm test
    
    # Security audit
    echo "Running security audit..."
    npm audit --audit-level high
    
    # Build production bundle if needed
    if [[ -f "webpack.config.js" || -f "vite.config.js" ]]; then
        echo "Building production bundle..."
        npm run build
    fi
    
    # Copy files to temp directory
    cp -r . "$TEMP_SERVICE_DIR/"
    cd "$TEMP_SERVICE_DIR" && npm ci --production && cd "$BUILD_DIR"
    
else
    echo "Unknown service type, copying files..."
    cp -r . "$TEMP_SERVICE_DIR/"
fi

# Set proper permissions
find "$TEMP_SERVICE_DIR" -type f -name "*.sh" -exec chmod +x {} \;
chmod +x "$TEMP_SERVICE_DIR/$SERVICE_NAME" 2>/dev/null || true

# Copy or create systemd service file
if [[ -f "${SERVICE_NAME}-prod.service" ]]; then
    echo "Installing production systemd service file..."
    cp "${SERVICE_NAME}-prod.service" "/etc/systemd/system/"
else
    echo "Creating default production systemd service file..."
    cat > "/etc/systemd/system/${SERVICE_NAME}-prod.service" << EOF
[Unit]
Description=${SERVICE_NAME} Production Service
After=network.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=$SERVICE_DIR
ExecStart=$SERVICE_DIR/$SERVICE_NAME
Restart=always
RestartSec=10
StartLimitBurst=3
StartLimitInterval=300
Environment=ENV=production

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$SERVICE_DIR
PrivateTmp=true

# Resource limits
LimitNOFILE=1048576
LimitNPROC=1048576

[Install]
WantedBy=multi-user.target
EOF
fi

systemctl daemon-reload

echo "=== Deploying to Production (Blue-Green Style) ==="

# If service exists, perform blue-green deployment
if systemctl list-unit-files "${SERVICE_NAME}-prod.service" | grep -q "${SERVICE_NAME}-prod.service"; then
    echo "Performing blue-green deployment..."
    
    # Check current service health before switching
    if systemctl is-active --quiet "${SERVICE_NAME}-prod"; then
        echo "Current service is running, checking health..."
        
        # Wait a moment for any ongoing requests to complete
        echo "Waiting for ongoing requests to complete..."
        sleep 5
        
        # Stop the current service gracefully
        echo "Stopping current service..."
        systemctl stop "${SERVICE_NAME}-prod"
        
        # Wait for service to fully stop
        sleep 3
    fi
    
    # Backup current version (if exists)
    if [[ -d "$SERVICE_DIR" ]]; then
        echo "Backing up current version..."
        mv "$SERVICE_DIR" "${SERVICE_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    # Move new version to production directory
    echo "Activating new version..."
    mv "$TEMP_SERVICE_DIR" "$SERVICE_DIR"
    
else
    echo "First time deployment..."
    mv "$TEMP_SERVICE_DIR" "$SERVICE_DIR"
fi

# Start the new service
echo "=== Starting Production Service ==="
systemctl enable "${SERVICE_NAME}-prod"
systemctl start "${SERVICE_NAME}-prod"

# Wait longer for production service to stabilize
echo "Waiting for service to stabilize..."
sleep 10

# Check if service is running
if systemctl is-active --quiet "${SERVICE_NAME}-prod"; then
    echo "Production service started successfully"
    
    # Remove old backup if deployment is successful (keep only latest)
    find "$DEPLOY_BASE" -maxdepth 1 -name "${SERVICE_NAME}.backup.*" -type d -exec ls -dt {} + | tail -n +2 | xargs rm -rf 2>/dev/null || true
    
else
    echo "ERROR: Production service failed to start"
    
    # Try to restore from backup if available
    LATEST_BACKUP=$(find "$DEPLOY_BASE" -maxdepth 1 -name "${SERVICE_NAME}.backup.*" -type d -exec ls -dt {} + | head -1)
    if [[ -n "$LATEST_BACKUP" ]]; then
        echo "Attempting to restore from backup: $LATEST_BACKUP"
        systemctl stop "${SERVICE_NAME}-prod" 2>/dev/null || true
        rm -rf "$SERVICE_DIR"
        mv "$LATEST_BACKUP" "$SERVICE_DIR"
        systemctl start "${SERVICE_NAME}-prod"
        
        if systemctl is-active --quiet "${SERVICE_NAME}-prod"; then
            echo "Service restored from backup successfully"
            exit 1  # Still return error as original deployment failed
        else
            echo "ERROR: Failed to restore from backup"
        fi
    fi
    
    journalctl -u "${SERVICE_NAME}-prod" --no-pager -n 30
    exit 1
fi

# Create deployment marker
echo "$(date -Iseconds)" > "$SERVICE_DIR/.prod_deploy_time"
echo "$(git describe --tags --always 2>/dev/null || echo 'unknown')" > "$SERVICE_DIR/.version"

echo "=== Production Deployment Completed Successfully ==="