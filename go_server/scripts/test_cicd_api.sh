#!/bin/bash

# Test script for CI/CD API functionality
# This script tests the CI/CD endpoints to ensure they work with JSON storage

SERVER_URL="http://localhost:9112"
API_BASE="$SERVER_URL/api"

echo "🧪 Testing CI/CD API endpoints..."
echo "================================="

# Function to make authenticated requests (you may need to adjust this based on your auth)
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3

    if [ "$method" = "GET" ]; then
        curl -s -X GET "$API_BASE$endpoint" \
             -H "Content-Type: application/json"
    else
        curl -s -X "$method" "$API_BASE$endpoint" \
             -H "Content-Type: application/json" \
             -d "$data"
    fi
}

echo "1. Testing deployment history endpoint..."
response=$(make_request "GET" "/cicd/deployments?limit=10")
echo "Response: $response"
echo ""

echo "2. Testing service environments endpoint..."
response=$(make_request "GET" "/cicd/environments")
echo "Response: $response"
echo ""

echo "3. Testing deployment stats endpoint..."
response=$(make_request "GET" "/cicd/stats?serviceName=ims_server_web&days=30")
echo "Response: $response"
echo ""

echo "✅ CI/CD API tests completed!"
echo ""
echo "💡 If all endpoints return JSON (even if empty), the storage backend is working correctly."
echo "🗄️  Check ./data/ directory for JSON files if SQLite is not available."