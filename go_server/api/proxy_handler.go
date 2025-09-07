package api

import (
	"context"
	"control/go_server/internal/storage"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// Global proxy log storage
var proxyLogStorage = storage.NewProxyLogStorage("./logs/proxy_replace")

// Initialization function to start cleanup routine
func init() {
	// Start cleanup routine - remove logs older than 90 days
	go func() {
		ticker := time.NewTicker(24 * time.Hour) // Check daily
		defer ticker.Stop()
		
		for range ticker.C {
			proxyLogStorage.CleanupOldLogs(90) // Keep logs for 90 days
		}
	}()
}

// LogProxyReplacement logs a proxy replacement operation (called from existing handlers)
func LogProxyReplacement(oldProxyID, newProxyID, oldMerchantID, newMerchantID int, 
	oldIP, oldPort, newIP, newPort string, success bool, devicesCount int, 
	reason, errorMessage, operator, operatorType string) error {
	
	oldProxy := storage.ProxyInfo{
		ID:         oldProxyID,
		IP:         oldIP,
		Port:       oldPort,
		MerchantID: oldMerchantID,
	}
	
	newProxy := storage.ProxyInfo{
		ID:         newProxyID,
		IP:         newIP,
		Port:       newPort,
		MerchantID: newMerchantID,
	}
	
	return proxyLogStorage.LogProxyReplace(
		oldProxy,
		newProxy,
		success,
		devicesCount,
		reason,
		errorMessage,
		operator,
		operatorType,
	)
}

// GetProxyReplaceLogHandler retrieves proxy replacement logs
func GetProxyReplaceLogHandler(c *gin.Context) {
	// Parse date range parameters
	startDateStr := c.DefaultQuery("startDate", time.Now().AddDate(0, 0, -30).Format("2006-01-02"))
	endDateStr := c.DefaultQuery("endDate", time.Now().Format("2006-01-02"))
	
	startDate, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid start date format"})
		return
	}
	
	endDate, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid end date format"})
		return
	}
	
	// Set end date to end of day
	endDate = endDate.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
	
	// Get logs from storage
	logs, err := proxyLogStorage.GetProxyReplaceLogs(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve logs"})
		return
	}
	
	// Get statistics
	stats, err := proxyLogStorage.GetLogStats(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to get statistics"})
		return
	}
	
	response := gin.H{
		"success": true,
		"logs":    logs,
	}
	
	// Merge stats into response
	for key, value := range stats {
		response[key] = value
	}
	
	c.JSON(http.StatusOK, response)
}

// DownloadReplaceLogHandler exports proxy replacement logs for download
func DownloadReplaceLogHandler(c *gin.Context) {
	// Parse date range parameters
	startDateStr := c.DefaultQuery("startDate", time.Now().AddDate(0, 0, -30).Format("2006-01-02"))
	endDateStr := c.DefaultQuery("endDate", time.Now().Format("2006-01-02"))
	
	startDate, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid start date format"})
		return
	}
	
	endDate, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid end date format"})
		return
	}
	
	// Set end date to end of day
	endDate = endDate.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
	
	// Export logs
	data, err := proxyLogStorage.ExportLogs(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to export logs"})
		return
	}
	
	filename := fmt.Sprintf("proxy_replace_log_%s_to_%s.json", 
		startDate.Format("2006-01-02"), 
		endDate.Format("2006-01-02"))
	
	// Set headers for file download
	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Type", "application/json")
	c.Header("Content-Length", strconv.Itoa(len(data)))
	
	// Send file data directly
	c.Data(http.StatusOK, "application/json", data)
}

// StartAutoReplaceHandler 启动后台自动更换任务
func StartAutoReplaceHandler(c *gin.Context) {
	autoReplaceTaskMutex.Lock()
	defer autoReplaceTaskMutex.Unlock()

	if autoReplaceTaskRunning {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "任务已经在运行中"})
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	autoReplaceTaskCancel = cancel
	go autoReplaceWorker(ctx) // 启动 worker

	autoReplaceTaskRunning = true
	autoReplaceStatusMessage = "任务已启动，等待第一次检测"
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "自动更换任务已启动"})
}

// StopAutoReplaceHandler 停止后台自动更换任务
func StopAutoReplaceHandler(c *gin.Context) {
	autoReplaceTaskMutex.Lock()
	defer autoReplaceTaskMutex.Unlock()

	if !autoReplaceTaskRunning {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "任务已经停止"})
		return
	}

	if autoReplaceTaskCancel != nil {
		autoReplaceTaskCancel() // 发送停止信号
	}

	autoReplaceTaskRunning = false
	autoReplaceStatusMessage = "已停止"
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "自动更换任务已停止"})
}

// GetAutoReplaceStatusHandler 获取后台任务的当前状态
func GetAutoReplaceStatusHandler(c *gin.Context) {
	autoReplaceTaskMutex.Lock()
	defer autoReplaceTaskMutex.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"isRunning":     autoReplaceTaskRunning,
		"statusMessage": autoReplaceStatusMessage,
	})
}