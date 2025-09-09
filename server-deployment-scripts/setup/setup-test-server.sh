#!/bin/bash
#
# Test server environment setup script
# Run this script on the test server to set up CI/CD environment
#

set -e

echo "=== Setting up Test Server CI/CD Environment ==="

# Configuration
REPOS_BASE="/opt/repos"
SERVICES_BASE="/opt/services-test"
LOGS_BASE="/opt/deployment-logs/test"
DEPLOY_USER="deploy"
DEPLOY_GROUP="deploy"

# Services to setup
SERVICES=("ims_server_web" "ims_server_ws" "ims_server_mq")

# Create deploy user and group if not exists
if ! id -u $DEPLOY_USER > /dev/null 2>&1; then
    echo "Creating deploy user..."
    useradd -r -s /bin/bash -d /home/$DEPLOY_USER -m $DEPLOY_USER
    usermod -aG sudo $DEPLOY_USER
else
    echo "Deploy user already exists"
fi

# Create necessary directories
echo "Creating directory structure..."
mkdir -p $REPOS_BASE $SERVICES_BASE $LOGS_BASE
chown -R $DEPLOY_USER:$DEPLOY_GROUP $REPOS_BASE $SERVICES_BASE $LOGS_BASE

# Install required packages
echo "Installing required packages..."
apt-get update
apt-get install -y git golang-go nodejs npm redis-server mysql-client curl netcat-openbsd systemd

# Configure Git
echo "Configuring Git..."
git config --global user.name "Test Server Deploy"
git config --global user.email "deploy@test-server.local"
git config --global init.defaultBranch main

# Setup Git repositories for each service
for service in "${SERVICES[@]}"; do
    echo "Setting up Git repository for $service..."
    
    # Create bare repository
    repo_path="$REPOS_BASE/${service}-test.git"
    if [[ ! -d "$repo_path" ]]; then
        mkdir -p "$repo_path"
        cd "$repo_path"
        git init --bare
        
        # Set permissions
        chown -R $DEPLOY_USER:$DEPLOY_GROUP "$repo_path"
        chmod -R 755 "$repo_path"
        
        echo "Repository created: $repo_path"
    else
        echo "Repository already exists: $repo_path"
    fi
    
    # Create service directory
    service_dir="$SERVICES_BASE/$service"
    mkdir -p "$service_dir"
    chown -R $DEPLOY_USER:$DEPLOY_GROUP "$service_dir"
    
    echo "Service directory created: $service_dir"
done

# Setup log rotation
echo "Setting up log rotation..."
cat > /etc/logrotate.d/cicd-deploy << EOF
$LOGS_BASE/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 $DEPLOY_USER $DEPLOY_GROUP
}
EOF

# Create webhook notification script
echo "Creating webhook notification script..."
mkdir -p /opt/scripts
cat > /opt/scripts/notify-deployment.sh << 'EOF'
#!/bin/bash
SERVICE=$1
ENVIRONMENT=$2
STATUS=$3
COMMIT_HASH=$4
MESSAGE=$5
LOG_FILE=$6

WEBHOOK_URL="http://monitor-server:8080/api/cicd/webhook"

curl -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"service\": \"$SERVICE\",
        \"environment\": \"$ENVIRONMENT\", 
        \"status\": \"$STATUS\",
        \"commit_hash\": \"$COMMIT_HASH\",
        \"message\": \"$MESSAGE\",
        \"log_file\": \"$LOG_FILE\"
    }" || true
EOF

chmod +x /opt/scripts/notify-deployment.sh
chown $DEPLOY_USER:$DEPLOY_GROUP /opt/scripts/notify-deployment.sh

# Setup systemd template for services
echo "Creating systemd service templates..."
cat > /etc/systemd/system/test-service@.service << EOF
[Unit]
Description=%i Test Service
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_GROUP
WorkingDirectory=$SERVICES_BASE/%i
ExecStart=$SERVICES_BASE/%i/%i
Restart=always
RestartSec=5
Environment=ENV=test
Environment=LOG_LEVEL=debug

# Resource limits for test environment
LimitNOFILE=65536
LimitNPROC=32768

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# Configure firewall if enabled
if systemctl is-enabled ufw >/dev/null 2>&1; then
    echo "Configuring firewall..."
    ufw allow 9000:9010/tcp comment "Test services ports"
    ufw allow 22/tcp comment "SSH"
    ufw allow from any to any port 80,443 comment "HTTP/HTTPS"
fi

# Setup monitoring and alerting
echo "Setting up basic monitoring..."
cat > /etc/systemd/system/test-health-monitor.service << EOF
[Unit]
Description=Test Environment Health Monitor
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_GROUP
ExecStart=/opt/scripts/health-monitor.sh
Restart=always
RestartSec=60

[Install]
WantedBy=multi-user.target
EOF

cat > /opt/scripts/health-monitor.sh << 'EOF'
#!/bin/bash
while true; do
    for service_dir in /opt/services-test/*; do
        if [[ -d "$service_dir" && -f "$service_dir/.commit" ]]; then
            service_name=$(basename "$service_dir")
            if ! systemctl is-active --quiet "${service_name}-test"; then
                echo "$(date): WARNING: $service_name-test is not running" >> /opt/deployment-logs/test/health-monitor.log
                # Optional: Send alert notification here
            fi
        fi
    done
    sleep 300  # Check every 5 minutes
done
EOF

chmod +x /opt/scripts/health-monitor.sh
chown $DEPLOY_USER:$DEPLOY_GROUP /opt/scripts/health-monitor.sh

# Start and enable health monitor
systemctl enable test-health-monitor
systemctl start test-health-monitor

# Create deployment status API
echo "Setting up deployment status API..."
cat > /opt/scripts/deployment-status.sh << 'EOF'
#!/bin/bash
# Simple HTTP server to provide deployment status
# Usage: curl http://test-server:8888/status

while true; do
    echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n$(cat /opt/deployment-logs/test/status.json 2>/dev/null || echo '{\"status\":\"unknown\"}')" | nc -l -p 8888 -q 1
done
EOF

chmod +x /opt/scripts/deployment-status.sh

# Setup SSH key access for deployment
echo "Setting up SSH access..."
mkdir -p /home/$DEPLOY_USER/.ssh
cat > /home/$DEPLOY_USER/.ssh/authorized_keys << 'EOF'
# Add public keys for CI/CD systems here
# ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... ci-cd-system@example.com
EOF

chmod 700 /home/$DEPLOY_USER/.ssh
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
chown -R $DEPLOY_USER:$DEPLOY_GROUP /home/$DEPLOY_USER/.ssh

# Create initial status file
echo '{"environment":"test","setup_time":"'$(date -Iseconds)'","status":"ready"}' > $LOGS_BASE/status.json
chown $DEPLOY_USER:$DEPLOY_GROUP $LOGS_BASE/status.json

echo "=== Test Server Setup Completed ==="
echo "Repository base: $REPOS_BASE"
echo "Services base: $SERVICES_BASE"
echo "Logs base: $LOGS_BASE"
echo "Deploy user: $DEPLOY_USER"
echo ""
echo "Next steps:"
echo "1. Copy the post-receive-test hook to each repository's hooks directory"
echo "2. Copy deployment scripts to each service repository"
echo "3. Configure service-specific settings"
echo "4. Test deployment by pushing to a test branch"
echo ""
echo "Example:"
echo "  cp ../git-hooks/post-receive-test $REPOS_BASE/ims_server_web-test.git/hooks/post-receive"
echo "  chmod +x $REPOS_BASE/ims_server_web-test.git/hooks/post-receive"