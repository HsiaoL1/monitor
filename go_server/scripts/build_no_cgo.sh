#!/bin/bash

# Build script for environments where CGO is not available
# This script builds the Go server with CGO disabled, using pure Go SQLite driver

set -e

echo "🔧 Building Go server with CGO disabled..."
echo "This build uses pure Go SQLite driver (modernc.org/sqlite)"

# Set environment variables
export CGO_ENABLED=0
export GOOS=linux
export GOARCH=amd64

# Build directory
BUILD_DIR="build"
mkdir -p "$BUILD_DIR"

# Build the server
echo "Building server binary..."
go build -ldflags="-w -s" -o "$BUILD_DIR/monitor_server" cmd/server/main.go

# Build the database initialization tool
echo "Building database initialization tool..."
go build -ldflags="-w -s" -o "$BUILD_DIR/init_cicd_db" scripts/init_cicd_db.go

echo "✅ Build completed successfully!"
echo "📁 Output files:"
ls -la "$BUILD_DIR/"

echo ""
echo "📋 Deployment instructions:"
echo "1. Copy the build/ directory to your server"
echo "2. Run: ./monitor_server"
echo "3. The server will automatically use JSON storage if SQLite is not available"
echo ""
echo "💡 Database storage fallback:"
echo "   - Primary: SQLite (if CGO available)"
echo "   - Fallback: JSON files in ./data/ directory"
echo ""