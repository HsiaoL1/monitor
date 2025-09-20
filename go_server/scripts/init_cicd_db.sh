#!/bin/bash

# CI/CD Database Initialization Script
# Usage: ./scripts/init_cicd_db.sh [database_path] [--with-test-data]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 CI/CD Database Initialization"
echo "================================="

# Change to project root
cd "$PROJECT_ROOT"

# Check if Go is available
if ! command -v go &> /dev/null; then
    echo "❌ Error: Go is not installed or not in PATH"
    exit 1
fi

# Set default database path
DB_PATH="${1:-./data/cicd.db}"
TEST_DATA_FLAG="${2:-}"

echo "📍 Project root: $PROJECT_ROOT"
echo "🗄️  Database path: $DB_PATH"

# Create data directory if it doesn't exist
DATA_DIR="$(dirname "$DB_PATH")"
if [ ! -d "$DATA_DIR" ]; then
    echo "📁 Creating data directory: $DATA_DIR"
    mkdir -p "$DATA_DIR"
fi

# Run the initialization script
echo "🔧 Running database initialization..."
if [ "$TEST_DATA_FLAG" = "--with-test-data" ]; then
    go run scripts/init_cicd_db.go "$DB_PATH" --with-test-data
else
    go run scripts/init_cicd_db.go "$DB_PATH"
fi

echo ""
echo "🎉 Database initialization completed!"
echo "💡 You can now start the server with: go run cmd/server/main.go"
echo ""
echo "📊 To view the database:"
echo "   sqlite3 $DB_PATH"
echo "   .tables"
echo "   .schema deployments"
echo ""