#!/bin/bash
#
# Production server environment setup script
# Run this script on the production server to set up CI/CD environment
# WARNING: This sets up production environment - use with caution
#

set -e

echo "=== Setting up Production Server CI/CD Environment ==="
echo "WARNING: This will configure a production environment"
read -p "Are you sure you want to continue? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Configuration
REPOS_BASE="/opt/repos"
SERVICES_BASE="/opt/services-prod"
BACKUPS_BASE="/opt/backups"
LOGS_BASE="/opt/deployment-logs/prod"
DEPLOY_USER="deploy"
DEPLOY_GROUP="deploy"

# Services to setup
SERVICES=("ims_server_web" "ims_server_ws" "ims_server_mq")

# Create deploy user and group if not exists
if ! id -u $DEPLOY_USER > /dev/null 2>&1; then
    echo "Creating deploy user..."
    useradd -r -s /bin/bash -d /home/$DEPLOY_USER -m $DEPLOY_USER
    # Note: No sudo access for production deploy user for security
else
    echo "Deploy user already exists"
fi

# Create necessary directories
echo "Creating directory structure..."
mkdir -p $REPOS_BASE $SERVICES_BASE $BACKUPS_BASE $LOGS_BASE
chown -R $DEPLOY_USER:$DEPLOY_GROUP $REPOS_BASE $SERVICES_BASE $BACKUPS_BASE $LOGS_BASE

# Set stricter permissions for production
chmod 750 $REPOS_BASE $SERVICES_BASE $BACKUPS_BASE
chmod 755 $LOGS_BASE

# Install required packages
echo "Installing required packages..."
apt-get update
apt-get install -y git golang-go nodejs npm redis-server mysql-client curl netcat-openbsd systemd fail2ban ufw

# Configure Git
echo "Configuring Git..."
git config --global user.name "Production Server Deploy"
git config --global user.email "deploy@prod-server.local"
git config --global init.defaultBranch main

# Setup Git repositories for each service
for service in "${SERVICES[@]}"; do
    echo "Setting up Git repository for $service..."
    
    # Create bare repository
    repo_path="$REPOS_BASE/${service}-prod.git"
    if [[ ! -d "$repo_path" ]]; then
        mkdir -p "$repo_path"
        cd "$repo_path"
        git init --bare
        
        # Set strict permissions for production
        chown -R $DEPLOY_USER:$DEPLOY_GROUP "$repo_path"
        chmod -R 750 "$repo_path"
        
        echo "Repository created: $repo_path"
    else
        echo "Repository already exists: $repo_path"
    fi
    
    # Create service directory
    service_dir="$SERVICES_BASE/$service"
    mkdir -p "$service_dir"
    chown -R $DEPLOY_USER:$DEPLOY_GROUP "$service_dir"
    chmod -R 750 "$service_dir"
    
    # Create backup directory
    backup_dir="$BACKUPS_BASE/$service"
    mkdir -p "$backup_dir"
    chown -R $DEPLOY_USER:$DEPLOY_GROUP "$backup_dir"
    chmod -R 750 "$backup_dir"
    
    echo "Service directory created: $service_dir"
    echo "Backup directory created: $backup_dir"
done

# Setup comprehensive log rotation
echo "Setting up log rotation..."
cat > /etc/logrotate.d/cicd-deploy-prod << EOF
$LOGS_BASE/*.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 644 $DEPLOY_USER $DEPLOY_GROUP
    postrotate
        systemctl reload rsyslog > /dev/null 2>&1 || true
    endscript
}

$BACKUPS_BASE/*/*.log {
    weekly
    rotate 12
    compress
    delaycompress
    missingok
    notifempty
    create 644 $DEPLOY_USER $DEPLOY_GROUP
}
EOF

# Setup systemd service templates with production security settings
echo "Creating production systemd service templates..."
cat > /etc/systemd/system/prod-service@.service << EOF
[Unit]
Description=%i Production Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_GROUP
WorkingDirectory=$SERVICES_BASE/%i
ExecStart=$SERVICES_BASE/%i/%i
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30
Restart=always
RestartSec=10
StartLimitBurst=3
StartLimitInterval=300

# Environment
Environment=ENV=production
Environment=LOG_LEVEL=info

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$SERVICES_BASE/%i
ReadOnlyPaths=/etc
PrivateTmp=true
PrivateDevices=true
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
RestrictRealtime=true
RestrictSUIDSGID=true

# Resource limits for production
LimitNOFILE=1048576
LimitNPROC=32768
LimitCORE=0

# Capabilities
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# Configure production firewall
echo "Configuring production firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
ufw allow 9000:9010/tcp comment "Service ports"

# Configure fail2ban for additional security
echo "Configuring fail2ban..."
cat > /etc/fail2ban/jail.d/cicd.conf << EOF
[sshd]
enabled = true
maxretry = 3
bantime = 3600
findtime = 600

[nginx-http-auth]
enabled = true
maxretry = 5
bantime = 3600

[nginx-limit-req]
enabled = true
maxretry = 10
bantime = 600
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# Setup production monitoring and alerting
echo "Setting up production monitoring..."
cat > /etc/systemd/system/prod-health-monitor.service << EOF
[Unit]
Description=Production Environment Health Monitor
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_GROUP
ExecStart=/opt/scripts/prod-health-monitor.sh
Restart=always
RestartSec=30
StartLimitBurst=5
StartLimitInterval=300

[Install]
WantedBy=multi-user.target
EOF

cat > /opt/scripts/prod-health-monitor.sh << 'EOF'
#!/bin/bash
LOG_FILE="/opt/deployment-logs/prod/health-monitor.log"

log() {
    echo "$(date -Iseconds): $1" | tee -a "$LOG_FILE"
}

alert() {
    log "ALERT: $1"
    # Send alert to monitoring system
    curl -X POST "http://monitor-server:8080/api/alerts" \
        -H "Content-Type: application/json" \
        -d "{\"level\":\"critical\",\"message\":\"$1\",\"environment\":\"production\"}" || true
}

while true; do
    # Check all production services
    for service_dir in /opt/services-prod/*; do
        if [[ -d "$service_dir" && -f "$service_dir/.commit" ]]; then
            service_name=$(basename "$service_dir")
            service_unit="${service_name}-prod"
            
            # Check if service is running
            if ! systemctl is-active --quiet "$service_unit"; then
                alert "Service $service_unit is not running"
                
                # Try to restart once
                log "Attempting to restart $service_unit"
                if systemctl restart "$service_unit"; then
                    log "Successfully restarted $service_unit"
                else
                    alert "Failed to restart $service_unit"
                fi
            fi
            
            # Check resource usage
            if [[ -f "$service_dir/$service_name" ]]; then
                pid=$(pgrep -f "$service_dir/$service_name" | head -1)
                if [[ -n "$pid" ]]; then
                    # Check memory usage (alert if >80% of system memory)
                    mem_percent=$(ps -o pid,pmem --no-headers -p "$pid" | awk '{print $2}' | cut -d. -f1)
                    if [[ -n "$mem_percent" && "$mem_percent" -gt 80 ]]; then
                        alert "Service $service_name memory usage is high: ${mem_percent}%"
                    fi
                    
                    # Check if process is responsive (if health endpoint exists)
                    case "$service_name" in
                        "ims_server_web")
                            if ! curl -f -s --max-time 10 "http://localhost:9090/health" > /dev/null; then
                                alert "Service $service_name health endpoint is not responding"
                            fi
                            ;;
                        "ims_server_ws")
                            if ! curl -f -s --max-time 10 "http://localhost:9000/health" > /dev/null; then
                                alert "Service $service_name health endpoint is not responding"
                            fi
                            ;;
                        "ims_server_mq")
                            if ! curl -f -s --max-time 10 "http://localhost:9002/health" > /dev/null; then
                                alert "Service $service_name health endpoint is not responding"
                            fi
                            ;;
                    esac
                fi
            fi
        fi
    done
    
    # Check system resources
    load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    if (( $(echo "$load_avg > 4.0" | bc -l) )); then
        alert "System load average is high: $load_avg"
    fi
    
    # Check disk space
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [[ "$disk_usage" -gt 85 ]]; then
        alert "Root filesystem usage is high: ${disk_usage}%"
    fi
    
    # Update status file
    cat > /opt/deployment-logs/prod/status.json << EOJ
{
    "environment": "production",
    "last_check": "$(date -Iseconds)",
    "load_average": "$load_avg",
    "disk_usage": "$disk_usage",
    "services": {
EOJ
    
    first_service=true
    for service_dir in /opt/services-prod/*; do
        if [[ -d "$service_dir" ]]; then
            service_name=$(basename "$service_dir")
            service_unit="${service_name}-prod"
            
            if [[ "$first_service" == true ]]; then
                first_service=false
            else
                echo "," >> /opt/deployment-logs/prod/status.json
            fi
            
            if systemctl is-active --quiet "$service_unit"; then
                status="running"
            else
                status="stopped"
            fi
            
            echo "        \"$service_name\": {\"status\": \"$status\"}" >> /opt/deployment-logs/prod/status.json
        fi
    done
    
    cat >> /opt/deployment-logs/prod/status.json << EOJ
    }
}
EOJ
    
    sleep 60  # Check every minute in production
done
EOF

chmod +x /opt/scripts/prod-health-monitor.sh
chown $DEPLOY_USER:$DEPLOY_GROUP /opt/scripts/prod-health-monitor.sh

# Setup automated backup script
echo "Setting up automated backup..."
cat > /opt/scripts/backup-services.sh << 'EOF'
#!/bin/bash
BACKUP_BASE="/opt/backups"
SERVICES_BASE="/opt/services-prod"
DATE=$(date +%Y%m%d_%H%M%S)

for service_dir in $SERVICES_BASE/*; do
    if [[ -d "$service_dir" ]]; then
        service_name=$(basename "$service_dir")
        backup_dir="$BACKUP_BASE/$service_name/daily/$DATE"
        
        mkdir -p "$backup_dir"
        cp -r "$service_dir"/* "$backup_dir/" 2>/dev/null || true
        
        # Keep only last 7 daily backups
        find "$BACKUP_BASE/$service_name/daily" -maxdepth 1 -type d -name "20*" | sort | head -n -7 | xargs rm -rf 2>/dev/null || true
    fi
done
EOF

chmod +x /opt/scripts/backup-services.sh
chown $DEPLOY_USER:$DEPLOY_GROUP /opt/scripts/backup-services.sh

# Setup cron job for daily backups
echo "0 2 * * * /opt/scripts/backup-services.sh" | crontab -u $DEPLOY_USER -

# Start and enable services
systemctl enable prod-health-monitor
systemctl start prod-health-monitor

# Setup SSH key access with restrictions
echo "Setting up SSH access..."
mkdir -p /home/$DEPLOY_USER/.ssh
cat > /home/$DEPLOY_USER/.ssh/authorized_keys << 'EOF'
# Add public keys for CI/CD systems here with restrictions
# Example with command restriction:
# command="/opt/scripts/deploy-only.sh" ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... ci-cd-system@example.com
EOF

chmod 700 /home/$DEPLOY_USER/.ssh
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
chown -R $DEPLOY_USER:$DEPLOY_GROUP /home/$DEPLOY_USER/.ssh

# Create production deployment audit log
touch $LOGS_BASE/deployment-audit.log
chown $DEPLOY_USER:$DEPLOY_GROUP $LOGS_BASE/deployment-audit.log
chmod 644 $LOGS_BASE/deployment-audit.log

# Create initial status file
echo '{"environment":"production","setup_time":"'$(date -Iseconds)'","status":"ready","security":"enhanced"}' > $LOGS_BASE/status.json
chown $DEPLOY_USER:$DEPLOY_GROUP $LOGS_BASE/status.json

echo "=== Production Server Setup Completed ==="
echo "Repository base: $REPOS_BASE"
echo "Services base: $SERVICES_BASE"
echo "Backups base: $BACKUPS_BASE"
echo "Logs base: $LOGS_BASE"
echo "Deploy user: $DEPLOY_USER"
echo ""
echo "SECURITY NOTICE:"
echo "- Firewall is enabled with restricted access"
echo "- Fail2ban is configured for intrusion prevention"
echo "- Services run with restricted privileges"
echo "- Automated monitoring and alerting is active"
echo ""
echo "Next steps:"
echo "1. Configure SSL/TLS certificates"
echo "2. Copy the post-receive-prod hook to each repository's hooks directory"
echo "3. Copy production deployment scripts to each service repository"
echo "4. Set up monitoring system integration"
echo "5. Test deployment in a staging environment first"
echo ""
echo "Example:"
echo "  cp ../git-hooks/post-receive-prod $REPOS_BASE/ims_server_web-prod.git/hooks/post-receive"
echo "  chmod +x $REPOS_BASE/ims_server_web-prod.git/hooks/post-receive"