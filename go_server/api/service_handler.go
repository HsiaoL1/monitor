package api

import (
	"control/go_server/config"
	"control/go_server/internal/models"
	"control/go_server/internal/utils"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ServiceStatusHandler checks the status of a single service.
func ServiceStatusHandler(c *gin.Context) {
	serviceName := c.Query("serviceName")
	if serviceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Service name is required"})
		return
	}

	pids, _ := utils.FindPidsByName(serviceName)
	status := "stopped"
	if len(pids) > 0 {
		status = "running"
	}
	c.JSON(http.StatusOK, gin.H{"status": status})
}

// ServicesStatusHandler checks the status of all services.
func ServicesStatusHandler(c *gin.Context) {
	statusMap := make(map[string]string)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, service := range config.Conf.Services {
		wg.Add(1)
		go func(s models.Service) {
			defer wg.Done()
			pids, _ := utils.FindPidsByName(s.Name)
			status := "stopped"
			if len(pids) > 0 {
				status = "running"
			}
			mu.Lock()
			statusMap[s.Name] = status
			mu.Unlock()
		}(service)
	}
	wg.Wait()
	c.JSON(http.StatusOK, statusMap)
}

// ServiceStartHandler starts a service.
func ServiceStartHandler(c *gin.Context) {
	var req models.Service
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required parameters"})
		return
	}
	scriptPath := filepath.Join(req.Path, req.DeployScript)
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("Script %s does not exist in %s", req.DeployScript, req.Path)})
		return
	}

	if req.DeployScript == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Deploy script cannot be empty"})
		return
	}

	if req.Path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Service path cannot be empty"})
		return
	}

	// Create temporary wrapper script
	wrapperScript := fmt.Sprintf(`#!/bin/bash
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/go/bin:$PATH
cd %s
%s
`, req.Path, req.DeployScript)

	// Create temporary file
	tmpFile, err := os.CreateTemp("", "deploy_*.sh")
	if err != nil {
		log.Printf("Failed to create temp file: %v", err)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Failed to create temporary script", "logs": err.Error()})
		return
	}

	// Write wrapper script to temp file
	_, err = tmpFile.WriteString(wrapperScript)
	if err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		log.Printf("Failed to write temp file: %v", err)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Failed to write temporary script", "logs": err.Error()})
		return
	}
	tmpFile.Close()

	// Make script executable
	err = os.Chmod(tmpFile.Name(), 0755)
	if err != nil {
		os.Remove(tmpFile.Name())
		log.Printf("Failed to make script executable: %v", err)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Failed to make script executable", "logs": err.Error()})
		return
	}


	// Execute the wrapper script with inherited environment
	cmd := exec.Command("/bin/bash", tmpFile.Name())
	cmd.Env = os.Environ() // Inherit all environment variables

	// Start the command asynchronously
	err = cmd.Start()
	if err != nil {
		os.Remove(tmpFile.Name())
		log.Printf("Failed to start deploy script: %v", err)
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Failed to start deploy script", "logs": err.Error()})
		return
	}


	// Wait for the process to complete in a goroutine and cleanup temp file
	go func() {
		cmd.Wait()
		os.Remove(tmpFile.Name()) // Clean up temp file
	}()

	// Return immediately without waiting for completion
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Deploy script started successfully"})
}

// ServiceStopHandler stops a service.
func ServiceStopHandler(c *gin.Context) {
	var req struct {
		ServiceName string `json:"serviceName"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Service name is required"})
		return
	}

	cmd := exec.Command("pkill", "-f", req.ServiceName)
	cmd.Run() // Ignore error, pkill returns 1 if no process is found

	time.Sleep(1 * time.Second)

	pids, _ := utils.FindPidsByName(req.ServiceName)
	if len(pids) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Service stopped successfully"})
	} else {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Failed to stop service"})
	}
}

// ServiceRestartHandler restarts a service.
func ServiceRestartHandler(c *gin.Context) {
	// In this implementation, restart is the same as start
	ServiceStartHandler(c)
}

// LogsHandler gets the logs of a service.
func LogsHandler(c *gin.Context) {
	serviceName := c.Param("serviceName")
	lines := c.DefaultQuery("lines", "100")

	service, found := utils.FindServiceByName(serviceName)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "Service not found"})
		return
	}

	logPath := filepath.Join(service.Path, "run.log")
	cmd := exec.Command("tail", "-n", lines, logPath)
	output, err := cmd.CombinedOutput()

	if err != nil {
		c.JSON(http.StatusOK, gin.H{"serviceName": serviceName, "logPath": logPath, "lines": []string{fmt.Sprintf("无法读取日志文件: %s", err.Error())}})
		return
	}

	logLines := strings.Split(strings.TrimSpace(string(output)), "\n")
	c.JSON(http.StatusOK, gin.H{"serviceName": serviceName, "logPath": logPath, "totalLines": len(logLines), "lines": logLines})
}
