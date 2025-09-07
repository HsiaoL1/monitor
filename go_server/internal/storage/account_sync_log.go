package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// AccountSyncLogEntry represents an account sync operation log entry
type AccountSyncLogEntry struct {
	ID            int         `json:"id,omitempty"`
	SyncTime      string      `json:"syncTime"`
	AccountInfo   AccountInfo `json:"accountInfo"`
	SyncType      string      `json:"syncType"` // "single" or "batch"
	Success       bool        `json:"success"`
	AccountsCount int         `json:"accountsCount"` // For batch operations
	Reason        string      `json:"reason,omitempty"`
	ErrorMessage  string      `json:"errorMessage,omitempty"`
	Operator      string      `json:"operator,omitempty"`
	OperatorType  string      `json:"operatorType"` // "manual" or "auto"
	BeforeStatus  int         `json:"beforeStatus"`
	AfterStatus   int         `json:"afterStatus"`
}

// AccountInfo represents basic account information for logging
type AccountInfo struct {
	ID          int    `json:"id"`
	Account     string `json:"account"`
	AppUniqueID string `json:"app_unique_id"`
	MerchantID  int    `json:"merchant_id"`
	PlatformID  int    `json:"platform_id"`
}

// AccountSyncLogStorage manages account sync logs in files
type AccountSyncLogStorage struct {
	logDir string
	mutex  sync.RWMutex
}

// NewAccountSyncLogStorage creates a new account sync log storage
func NewAccountSyncLogStorage(logDir string) *AccountSyncLogStorage {
	// Ensure log directory exists
	os.MkdirAll(logDir, 0755)

	return &AccountSyncLogStorage{
		logDir: logDir,
	}
}

// LogAccountSync logs an account sync operation
func (asls *AccountSyncLogStorage) LogAccountSync(
	accountInfo AccountInfo,
	syncType string,
	success bool,
	accountsCount int,
	reason string,
	errorMessage string,
	operator string,
	operatorType string,
	beforeStatus int,
	afterStatus int,
) error {
	asls.mutex.Lock()
	defer asls.mutex.Unlock()

	entry := AccountSyncLogEntry{
		SyncTime:      time.Now().Format(time.RFC3339),
		AccountInfo:   accountInfo,
		SyncType:      syncType,
		Success:       success,
		AccountsCount: accountsCount,
		Reason:        reason,
		ErrorMessage:  errorMessage,
		Operator:      operator,
		OperatorType:  operatorType,
		BeforeStatus:  beforeStatus,
		AfterStatus:   afterStatus,
	}

	// Generate filename based on current date
	filename := fmt.Sprintf("account_sync_%s.json", time.Now().Format("2006-01-02"))
	filepath := filepath.Join(asls.logDir, filename)

	// Read existing logs for today
	var logs []AccountSyncLogEntry
	if data, err := os.ReadFile(filepath); err == nil {
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

	if err := os.WriteFile(filepath, data, 0644); err != nil {
		return fmt.Errorf("failed to write log file: %v", err)
	}

	return nil
}

// GetAccountSyncLogs retrieves account sync logs within a date range
func (asls *AccountSyncLogStorage) GetAccountSyncLogs(startDate, endDate time.Time) ([]AccountSyncLogEntry, error) {
	asls.mutex.RLock()
	defer asls.mutex.RUnlock()

	var allLogs []AccountSyncLogEntry

	// Read all log files in the directory
	files, err := os.ReadDir(asls.logDir)
	if err != nil {
		return allLogs, fmt.Errorf("failed to read log directory: %v", err)
	}

	for _, file := range files {
		if !file.IsDir() && filepath.Ext(file.Name()) == ".json" {
			// Extract date from filename
			filename := file.Name()
			if len(filename) >= 18 && filename[:12] == "account_sync" {
				dateStr := filename[13:23] // Extract YYYY-MM-DD part
				if fileDate, err := time.Parse("2006-01-02", dateStr); err == nil {
					// Check if file date is within range
					if fileDate.Before(startDate) || fileDate.After(endDate) {
						continue
					}

					// Read and parse log file
					filepath := filepath.Join(asls.logDir, filename)
					if data, err := os.ReadFile(filepath); err == nil {
						var logs []AccountSyncLogEntry
						if err := json.Unmarshal(data, &logs); err == nil {
							// Filter logs by exact time range
							for _, log := range logs {
								if logTime, err := time.Parse(time.RFC3339, log.SyncTime); err == nil {
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

	// Sort logs by sync time (newest first)
	sort.Slice(allLogs, func(i, j int) bool {
		timeI, _ := time.Parse(time.RFC3339, allLogs[i].SyncTime)
		timeJ, _ := time.Parse(time.RFC3339, allLogs[j].SyncTime)
		return timeI.After(timeJ)
	})

	return allLogs, nil
}

// GetLogStats returns statistics about sync logs
func (asls *AccountSyncLogStorage) GetLogStats(startDate, endDate time.Time) (map[string]interface{}, error) {
	logs, err := asls.GetAccountSyncLogs(startDate, endDate)
	if err != nil {
		return nil, err
	}

	totalRecords := len(logs)
	successCount := 0
	failureCount := 0
	singleSyncCount := 0
	batchSyncCount := 0

	for _, log := range logs {
		if log.Success {
			successCount++
		} else {
			failureCount++
		}

		if log.SyncType == "single" {
			singleSyncCount++
		} else if log.SyncType == "batch" {
			batchSyncCount++
		}
	}

	return map[string]interface{}{
		"totalRecords":    totalRecords,
		"successCount":    successCount,
		"failureCount":    failureCount,
		"singleSyncCount": singleSyncCount,
		"batchSyncCount":  batchSyncCount,
		"dateRange": map[string]interface{}{
			"start": startDate.Format(time.RFC3339),
			"end":   endDate.Format(time.RFC3339),
		},
	}, nil
}

// CleanupOldLogs removes log files older than specified days
func (asls *AccountSyncLogStorage) CleanupOldLogs(retentionDays int) error {
	asls.mutex.Lock()
	defer asls.mutex.Unlock()

	cutoffDate := time.Now().AddDate(0, 0, -retentionDays)

	files, err := os.ReadDir(asls.logDir)
	if err != nil {
		return fmt.Errorf("failed to read log directory: %v", err)
	}

	for _, file := range files {
		if !file.IsDir() && filepath.Ext(file.Name()) == ".json" {
			filename := file.Name()
			if len(filename) >= 18 && filename[:12] == "account_sync" {
				dateStr := filename[13:23]
				if fileDate, err := time.Parse("2006-01-02", dateStr); err == nil {
					if fileDate.Before(cutoffDate) {
						filepath := filepath.Join(asls.logDir, filename)
						if err := os.Remove(filepath); err == nil {
							fmt.Printf("Removed old account sync log file: %s\n", filename)
						}
					}
				}
			}
		}
	}

	return nil
}

// ExportLogs exports logs to JSON format for download
func (asls *AccountSyncLogStorage) ExportLogs(startDate, endDate time.Time) ([]byte, error) {
	logs, err := asls.GetAccountSyncLogs(startDate, endDate)
	if err != nil {
		return nil, err
	}

	stats, _ := asls.GetLogStats(startDate, endDate)

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
