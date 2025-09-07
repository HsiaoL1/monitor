package storage

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// ProxyReplaceLogEntry represents a proxy replacement log entry
type ProxyReplaceLogEntry struct {
	ID          int    `json:"id,omitempty"`
	ReplaceTime string `json:"replaceTime"`
	OldProxy    ProxyInfo `json:"oldProxy"`
	NewProxy    ProxyInfo `json:"newProxy"`
	Success     bool   `json:"success"`
	DevicesCount int   `json:"devicesCount"`
	Reason      string `json:"reason,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
	Operator    string `json:"operator,omitempty"`
	OperatorType string `json:"operatorType"` // "manual" or "auto"
}

// ProxyInfo represents basic proxy information for logging
type ProxyInfo struct {
	ID         int `json:"id"`
	IP         string `json:"ip"`
	Port       string `json:"port"`
	MerchantID int `json:"merchant_id"`
}

// ProxyLogStorage manages proxy replacement logs in files
type ProxyLogStorage struct {
	logDir string
	mutex  sync.RWMutex
}

// NewProxyLogStorage creates a new proxy log storage
func NewProxyLogStorage(logDir string) *ProxyLogStorage {
	// Ensure log directory exists
	os.MkdirAll(logDir, 0755)
	
	return &ProxyLogStorage{
		logDir: logDir,
	}
}

// LogProxyReplace logs a proxy replacement operation
func (pls *ProxyLogStorage) LogProxyReplace(
	oldProxy ProxyInfo,
	newProxy ProxyInfo,
	success bool,
	devicesCount int,
	reason string,
	errorMessage string,
	operator string,
	operatorType string,
) error {
	pls.mutex.Lock()
	defer pls.mutex.Unlock()

	entry := ProxyReplaceLogEntry{
		ReplaceTime:  time.Now().Format(time.RFC3339),
		OldProxy:     oldProxy,
		NewProxy:     newProxy,
		Success:      success,
		DevicesCount: devicesCount,
		Reason:       reason,
		ErrorMessage: errorMessage,
		Operator:     operator,
		OperatorType: operatorType,
	}

	// Generate filename based on current date
	filename := fmt.Sprintf("proxy_replace_%s.json", time.Now().Format("2006-01-02"))
	filepath := filepath.Join(pls.logDir, filename)

	// Read existing logs for today
	var logs []ProxyReplaceLogEntry
	if data, err := ioutil.ReadFile(filepath); err == nil {
		json.Unmarshal(data, &logs)
	}

	// Generate unique ID for this entry
	entry.ID = len(logs) + 1

	// Append new entry
	logs = append(logs, entry)

	// Write back to file
	data, err := json.MarshalIndent(logs, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal log data: %v", err)
	}

	if err := ioutil.WriteFile(filepath, data, 0644); err != nil {
		return fmt.Errorf("failed to write log file: %v", err)
	}

	return nil
}

// GetProxyReplaceLogs retrieves proxy replacement logs within a date range
func (pls *ProxyLogStorage) GetProxyReplaceLogs(startDate, endDate time.Time) ([]ProxyReplaceLogEntry, error) {
	pls.mutex.RLock()
	defer pls.mutex.RUnlock()

	var allLogs []ProxyReplaceLogEntry

	// Read all log files in the directory
	files, err := ioutil.ReadDir(pls.logDir)
	if err != nil {
		return allLogs, fmt.Errorf("failed to read log directory: %v", err)
	}

	for _, file := range files {
		if !file.IsDir() && filepath.Ext(file.Name()) == ".json" {
			// Extract date from filename
			filename := file.Name()
			if len(filename) >= 19 && filename[:13] == "proxy_replace" {
				dateStr := filename[14:24] // Extract YYYY-MM-DD part
				if fileDate, err := time.Parse("2006-01-02", dateStr); err == nil {
					// Check if file date is within range
					if fileDate.Before(startDate) || fileDate.After(endDate) {
						continue
					}

					// Read and parse log file
					filepath := filepath.Join(pls.logDir, filename)
					if data, err := ioutil.ReadFile(filepath); err == nil {
						var logs []ProxyReplaceLogEntry
						if err := json.Unmarshal(data, &logs); err == nil {
							// Filter logs by exact time range
							for _, log := range logs {
								if logTime, err := time.Parse(time.RFC3339, log.ReplaceTime); err == nil {
									if !logTime.Before(startDate) && !logTime.After(endDate) {
										allLogs = append(allLogs, log)
									}
								}
							}
						}
					}
				}
			}
		}
	}

	// Sort logs by replace time (newest first)
	sort.Slice(allLogs, func(i, j int) bool {
		timeI, _ := time.Parse(time.RFC3339, allLogs[i].ReplaceTime)
		timeJ, _ := time.Parse(time.RFC3339, allLogs[j].ReplaceTime)
		return timeI.After(timeJ)
	})

	return allLogs, nil
}

// GetLogStats returns statistics about replacement logs
func (pls *ProxyLogStorage) GetLogStats(startDate, endDate time.Time) (map[string]interface{}, error) {
	logs, err := pls.GetProxyReplaceLogs(startDate, endDate)
	if err != nil {
		return nil, err
	}

	totalRecords := len(logs)
	successCount := 0
	failureCount := 0

	for _, log := range logs {
		if log.Success {
			successCount++
		} else {
			failureCount++
		}
	}

	return map[string]interface{}{
		"totalRecords": totalRecords,
		"successCount": successCount,
		"failureCount": failureCount,
		"dateRange": map[string]interface{}{
			"start": startDate.Format(time.RFC3339),
			"end":   endDate.Format(time.RFC3339),
		},
	}, nil
}

// CleanupOldLogs removes log files older than specified days
func (pls *ProxyLogStorage) CleanupOldLogs(retentionDays int) error {
	pls.mutex.Lock()
	defer pls.mutex.Unlock()

	cutoffDate := time.Now().AddDate(0, 0, -retentionDays)

	files, err := ioutil.ReadDir(pls.logDir)
	if err != nil {
		return fmt.Errorf("failed to read log directory: %v", err)
	}

	for _, file := range files {
		if !file.IsDir() && filepath.Ext(file.Name()) == ".json" {
			filename := file.Name()
			if len(filename) >= 19 && filename[:13] == "proxy_replace" {
				dateStr := filename[14:24]
				if fileDate, err := time.Parse("2006-01-02", dateStr); err == nil {
					if fileDate.Before(cutoffDate) {
						filepath := filepath.Join(pls.logDir, filename)
						if err := os.Remove(filepath); err == nil {
							fmt.Printf("Removed old proxy log file: %s\n", filename)
						}
					}
				}
			}
		}
	}

	return nil
}

// ExportLogs exports logs to JSON format for download
func (pls *ProxyLogStorage) ExportLogs(startDate, endDate time.Time) ([]byte, error) {
	logs, err := pls.GetProxyReplaceLogs(startDate, endDate)
	if err != nil {
		return nil, err
	}

	stats, _ := pls.GetLogStats(startDate, endDate)

	exportData := map[string]interface{}{
		"metadata": map[string]interface{}{
			"exportTime": time.Now().Format(time.RFC3339),
			"dateRange": map[string]interface{}{
				"start": startDate.Format(time.RFC3339),
				"end":   endDate.Format(time.RFC3339),
			},
			"totalRecords": len(logs),
		},
		"statistics": stats,
		"logs":       logs,
	}

	return json.MarshalIndent(exportData, "", "  ")
}