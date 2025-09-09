#!/bin/bash
#
# Health check script template for deployed services
# This script should be customized for each service's specific health check requirements
#

set -e

SERVICE_NAME=$1
ENVIRONMENT=$2

if [[ -z "$SERVICE_NAME" || -z "$ENVIRONMENT" ]]; then
    echo "Usage: $0 <service_name> <environment>"
    exit 1
fi

# Configuration based on environment
if [[ "$ENVIRONMENT" == "production" ]]; then
    BASE_URL="http://localhost:8080"
    MAX_RETRIES=5
    RETRY_INTERVAL=10
else
    BASE_URL="http://localhost:8080"
    MAX_RETRIES=3
    RETRY_INTERVAL=5
fi

echo "=== Health Check for $SERVICE_NAME in $ENVIRONMENT ==="
echo "Base URL: $BASE_URL"

# Function to check HTTP endpoint
check_http_endpoint() {
    local endpoint=$1
    local expected_status=$2
    local description=$3
    
    echo "Checking $description: $endpoint"
    
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$endpoint" || echo "000")
    
    if [[ "$response_code" == "$expected_status" ]]; then
        echo "✓ $description: OK (HTTP $response_code)"
        return 0
    else
        echo "✗ $description: FAILED (HTTP $response_code)"
        return 1
    fi
}

# Function to check port availability
check_port() {
    local port=$1
    local description=$2
    
    echo "Checking $description on port $port"
    
    if nc -z localhost "$port"; then
        echo "✓ $description: Port $port is open"
        return 0
    else
        echo "✗ $description: Port $port is not accessible"
        return 1
    fi
}

# Function to check service process
check_process() {
    local service_name=$1
    
    echo "Checking if $service_name process is running"
    
    if pgrep -f "$service_name" > /dev/null; then
        echo "✓ Process check: $service_name is running"
        return 0
    else
        echo "✗ Process check: $service_name is not running"
        return 1
    fi
}

# Function to check systemd service status
check_systemd_service() {
    local service_unit="${SERVICE_NAME}-${ENVIRONMENT}.service"
    
    echo "Checking systemd service: $service_unit"
    
    if systemctl is-active --quiet "$service_unit"; then
        echo "✓ Systemd service: $service_unit is active"
        
        # Check if service is also enabled
        if systemctl is-enabled --quiet "$service_unit"; then
            echo "✓ Systemd service: $service_unit is enabled"
        else
            echo "⚠ Systemd service: $service_unit is not enabled"
        fi
        return 0
    else
        echo "✗ Systemd service: $service_unit is not active"
        systemctl status "$service_unit" --no-pager -l || true
        return 1
    fi
}

# Function to check database connectivity (if applicable)
check_database() {
    # This is a template - customize based on your database
    # Example for MySQL:
    # mysql -h localhost -u $DB_USER -p$DB_PASSWORD -e "SELECT 1" $DB_NAME
    
    # Example for PostgreSQL:
    # psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT 1"
    
    echo "Database connectivity check not implemented for this service"
    return 0
}

# Function to check external dependencies
check_external_deps() {
    # Check Redis if service uses it
    if [[ "$SERVICE_NAME" =~ (web|ws|mq) ]]; then
        if redis-cli ping | grep -q "PONG"; then
            echo "✓ Redis: Connection successful"
        else
            echo "✗ Redis: Connection failed"
            return 1
        fi
    fi
    
    return 0
}

# Main health check execution with retries
main_health_check() {
    local all_checks_passed=true
    
    echo "Starting health check with $MAX_RETRIES retries, $RETRY_INTERVAL second intervals"
    
    for ((i=1; i<=MAX_RETRIES; i++)); do
        echo "--- Health Check Attempt $i/$MAX_RETRIES ---"
        local attempt_passed=true
        
        # 1. Check systemd service status
        if ! check_systemd_service; then
            attempt_passed=false
        fi
        
        # 2. Check process is running
        if ! check_process "$SERVICE_NAME"; then
            attempt_passed=false
        fi
        
        # 3. Check port availability (customize ports based on service)
        case "$SERVICE_NAME" in
            "ims_server_web")
                check_port 9090 "Web server port" || attempt_passed=false
                ;;
            "ims_server_ws")
                check_port 9000 "WebSocket server port" || attempt_passed=false
                ;;
            "ims_server_mq")
                check_port 9002 "Message queue server port" || attempt_passed=false
                ;;
            *)
                check_port 8080 "Default service port" || attempt_passed=false
                ;;
        esac
        
        # 4. Check HTTP endpoints (customize based on service)
        case "$SERVICE_NAME" in
            "ims_server_web")
                check_http_endpoint "$BASE_URL:9090/health" "200" "Health endpoint" || attempt_passed=false
                check_http_endpoint "$BASE_URL:9090/debug/pprof" "200" "Pprof endpoint" || attempt_passed=false
                ;;
            "ims_server_ws")
                check_http_endpoint "$BASE_URL:9000/health" "200" "Health endpoint" || attempt_passed=false
                ;;
            "ims_server_mq")
                check_http_endpoint "$BASE_URL:9002/health" "200" "Health endpoint" || attempt_passed=false
                ;;
            *)
                check_http_endpoint "$BASE_URL/health" "200" "Health endpoint" || attempt_passed=false
                ;;
        esac
        
        # 5. Check database connectivity (if needed)
        if ! check_database; then
            attempt_passed=false
        fi
        
        # 6. Check external dependencies
        if ! check_external_deps; then
            attempt_passed=false
        fi
        
        # 7. Custom service-specific checks
        case "$SERVICE_NAME" in
            "ims_server_web")
                # Example: Check specific API endpoints
                check_http_endpoint "$BASE_URL:9090/api/version" "200" "Version API" || attempt_passed=false
                ;;
            "ims_server_ws")
                # Example: Check WebSocket upgrade capability
                echo "WebSocket specific checks would go here"
                ;;
            "ims_server_mq")
                # Example: Check message queue health
                echo "Message queue specific checks would go here"
                ;;
        esac
        
        if [[ "$attempt_passed" == true ]]; then
            echo "✓ All health checks passed on attempt $i"
            return 0
        else
            echo "✗ Some health checks failed on attempt $i"
            if [[ $i -lt $MAX_RETRIES ]]; then
                echo "Waiting $RETRY_INTERVAL seconds before retry..."
                sleep $RETRY_INTERVAL
            fi
        fi
    done
    
    echo "✗ Health check failed after $MAX_RETRIES attempts"
    return 1
}

# Run the health check
echo "=== Starting Health Check ==="
if main_health_check; then
    echo "=== Health Check PASSED ==="
    exit 0
else
    echo "=== Health Check FAILED ==="
    
    # In production, gather diagnostic information
    if [[ "$ENVIRONMENT" == "production" ]]; then
        echo "=== Diagnostic Information ==="
        echo "System load:"
        uptime
        echo "Memory usage:"
        free -h
        echo "Disk usage:"
        df -h
        echo "Recent log entries:"
        journalctl -u "${SERVICE_NAME}-${ENVIRONMENT}.service" --no-pager -n 10 || true
    fi
    
    exit 1
fi