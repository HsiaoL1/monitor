package utils

import (
	"control/go_server/config"
	"control/go_server/internal/models"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// AutoRestartManager manages automatic restarts for services
type AutoRestartManager struct {
	restartCooldowns map[string]time.Time // Track last restart time for each service
	mutex            sync.RWMutex
}

// NewAutoRestartManager creates a new auto restart manager
func NewAutoRestartManager() *AutoRestartManager {
	return &AutoRestartManager{
		restartCooldowns: make(map[string]time.Time),
	}
}

// Global instance
var autoRestartManager = NewAutoRestartManager()

// CheckMemoryAndRestart checks if a service exceeds memory threshold and restarts if needed
func CheckMemoryAndRestart(serviceName string, memoryUsageMB float64) {
	// Find service configuration
	var service *models.Service
	for _, s := range config.Conf.Services {
		if s.Name == serviceName {
			service = &s
			break
		}
	}

	if service == nil {
		log.Printf("Service %s not found in configuration", serviceName)
		return
	}

	// Check if auto-restart is enabled and threshold is set
	if !service.AutoRestart || service.MemoryThresholdMB <= 0 {
		return
	}

	// Check if memory usage exceeds threshold
	if memoryUsageMB < service.MemoryThresholdMB {
		return
	}

	// Check cooldown period (prevent frequent restarts)
	autoRestartManager.mutex.RLock()
	lastRestart, exists := autoRestartManager.restartCooldowns[serviceName]
	autoRestartManager.mutex.RUnlock()

	cooldownPeriod := 10 * time.Minute // 10 minutes cooldown
	if exists && time.Since(lastRestart) < cooldownPeriod {
		log.Printf("Service %s memory threshold exceeded (%.2f MB > %.2f MB) but still in cooldown period",
			serviceName, memoryUsageMB, service.MemoryThresholdMB)
		return
	}

	log.Printf("⚠️ Service %s memory threshold exceeded: %.2f MB > %.2f MB, initiating auto-restart",
		serviceName, memoryUsageMB, service.MemoryThresholdMB)

	// Record restart time
	autoRestartManager.mutex.Lock()
	autoRestartManager.restartCooldowns[serviceName] = time.Now()
	autoRestartManager.mutex.Unlock()

	// Perform restart
	//go performServiceRestart(service)
}

// performServiceRestart performs the actual service restart
func performServiceRestart(service *models.Service) {
	startTime := time.Now()
	log.Printf("🔄 Starting auto-restart for service: %s", service.Name)

	// Step 1: Stop the service
	log.Printf("Stopping service %s...", service.Name)
	stopCmd := exec.Command("pkill", "-f", service.Name)
	if err := stopCmd.Run(); err != nil {
		log.Printf("Warning: Failed to stop service %s: %v", service.Name, err)
	}

	// Wait for service to stop
	time.Sleep(3 * time.Second)

	// Verify service is stopped
	pids, err := FindPidsByName(service.Name)
	if err == nil && len(pids) > 0 {
		log.Printf("Service %s still running, force killing...", service.Name)
		forceKillCmd := exec.Command("pkill", "-9", "-f", service.Name)
		forceKillCmd.Run()
		time.Sleep(2 * time.Second)
	}

	// Step 2: Start the service using deploy script
	log.Printf("Starting service %s using deploy script...", service.Name)

	scriptPath := filepath.Join(service.Path, service.DeployScript)
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		log.Printf("❌ Auto-restart failed: Deploy script %s does not exist", scriptPath)
		return
	}

	// Create wrapper script for proper environment
	wrapperScript := fmt.Sprintf(`#!/bin/bash
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/go/bin:$PATH
cd %s
%s
`, service.Path, service.DeployScript)

	// Create temporary file
	tmpFile, err := os.CreateTemp("", "auto_restart_*.sh")
	if err != nil {
		log.Printf("❌ Auto-restart failed: Cannot create temp script: %v", err)
		return
	}
	tmpFileName := tmpFile.Name()

	// Write wrapper script
	if _, err := tmpFile.WriteString(wrapperScript); err != nil {
		tmpFile.Close()
		os.Remove(tmpFileName)
		log.Printf("❌ Auto-restart failed: Cannot write temp script: %v", err)
		return
	}
	tmpFile.Close()

	// Make script executable
	if err := os.Chmod(tmpFileName, 0755); err != nil {
		os.Remove(tmpFileName)
		log.Printf("❌ Auto-restart failed: Cannot make script executable: %v", err)
		return
	}

	// Execute restart script
	restartCmd := exec.Command("/bin/bash", tmpFileName)
	restartCmd.Env = os.Environ()

	if err := restartCmd.Start(); err != nil {
		os.Remove(tmpFileName)
		log.Printf("❌ Auto-restart failed: Cannot start deploy script: %v", err)
		return
	}

	// Wait for restart completion in background
	go func() {
		restartCmd.Wait()
		
		// Clean up temp file after script execution completes
		os.Remove(tmpFileName)

		// Verify service is running after restart
		time.Sleep(5 * time.Second)
		pids, err := FindPidsByName(service.Name)

		duration := time.Since(startTime)
		if err == nil && len(pids) > 0 {
			log.Printf("✅ Auto-restart completed successfully for service %s (took %v)", service.Name, duration)
		} else {
			log.Printf("❌ Auto-restart failed: Service %s not running after restart (took %v)", service.Name, duration)
		}
	}()
}

// GetRestartHistory returns the restart history for services
func GetRestartHistory() map[string]time.Time {
	autoRestartManager.mutex.RLock()
	defer autoRestartManager.mutex.RUnlock()

	history := make(map[string]time.Time)
	for serviceName, lastRestart := range autoRestartManager.restartCooldowns {
		history[serviceName] = lastRestart
	}
	return history
}

// IsInCooldown checks if a service is in cooldown period
func IsInCooldown(serviceName string) bool {
	autoRestartManager.mutex.RLock()
	defer autoRestartManager.mutex.RUnlock()

	lastRestart, exists := autoRestartManager.restartCooldowns[serviceName]
	if !exists {
		return false
	}

	cooldownPeriod := 10 * time.Minute
	return time.Since(lastRestart) < cooldownPeriod
}
