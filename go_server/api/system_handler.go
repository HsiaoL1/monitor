package api

import (
	"bufio"
	"control/go_server/config"
	"control/go_server/internal/models"
	"control/go_server/internal/storage"
	"control/go_server/internal/utils"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// TerminalSession represents a terminal session state
type TerminalSession struct {
	ID          string
	WorkingDir  string
	Environment map[string]string
	LastUsed    time.Time
}

// Global session storage (in production, use proper storage)
var terminalSessions = make(map[string]*TerminalSession)
var sessionMutex sync.RWMutex

// Global memory store for metrics history
var metricsStore = storage.NewMemoryStore()

// Start metrics collection routine
func init() {
	go metricsCollectionRoutine()
}

// metricsCollectionRoutine periodically collects and stores metrics
func metricsCollectionRoutine() {
	ticker := time.NewTicker(10 * time.Second) // collect every 10 seconds
	defer ticker.Stop()
	
	for range ticker.C {
		collectAndStoreMetrics()
	}
}

// collectAndStoreMetrics collects metrics for all services and stores them
func collectAndStoreMetrics() {
	var wg sync.WaitGroup
	
	for _, service := range config.Conf.Services {
		wg.Add(1)
		go func(s models.Service) {
			defer wg.Done()
			
			pids, _ := utils.FindPidsByName(s.Name)
			
			if len(pids) > 0 {
				var totalCpu float64
				var totalMemory float64 // in MB
				
				for _, pid := range pids {
					proc, err := process.NewProcess(pid)
					if err != nil {
						continue
					}
					cpuPercent, _ := proc.CPUPercent()
					memInfo, _ := proc.MemoryInfo()
					
					totalCpu += cpuPercent
					totalMemory += float64(memInfo.RSS) / 1024 / 1024 // Bytes to MB
				}
				
				// Store metrics in memory
				metricsStore.AddMetric(s.Name, totalCpu, totalMemory)
			}
		}(service)
	}
	
	wg.Wait()
}

// SystemMetricsHandler gets metrics for all services.
func SystemMetricsHandler(c *gin.Context) {
	metricsData := make(map[string]any)
	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, service := range config.Conf.Services {
		wg.Add(1)
		go func(s models.Service) {
			defer wg.Done()
			pids, _ := utils.FindPidsByName(s.Name)

			metric := gin.H{
				"serviceName": s.Name,
				"status":      "stopped",
				"cpu":         0,
				"memory":      0,
				"processes":   0,
				"goroutines":  0,
				"ports":       []string{},
				"timestamp":   time.Now().UnixMilli(),
			}

			if len(pids) > 0 {
				metric["status"] = "running"
				metric["processes"] = len(pids)
				var totalCpu float64
				var totalMemory float64 // in MB

				for _, pid := range pids {
					proc, err := process.NewProcess(pid)
					if err != nil {
						continue
					}
					cpuPercent, _ := proc.CPUPercent()
					memInfo, _ := proc.MemoryInfo()

					totalCpu += cpuPercent
					totalMemory += float64(memInfo.RSS) / 1024 / 1024 // Bytes to MB
				}
				metric["cpu"] = totalCpu
				metric["memory"] = totalMemory

				// Get listening ports for the service
				ports, err := utils.GetServicePorts(s.Name)
				if err == nil {
					metric["ports"] = ports
				} else {
					metric["ports"] = []string{}
				}

				// Get goroutine count if pprof is available
				if s.PprofURL != "" {
					goroutineURL := s.PprofURL + "goroutine"
					resp, err := http.Get(goroutineURL)
					if err == nil {
						defer resp.Body.Close()
						body, err := io.ReadAll(resp.Body)
						if err == nil {
							scanner := bufio.NewScanner(strings.NewReader(string(body)))
							for scanner.Scan() {
								line := scanner.Text()
								if strings.HasPrefix(line, "goroutine profile: total ") {
									parts := strings.Split(line, " ")
									if len(parts) == 4 {
										count, _ := strconv.Atoi(parts[3])
										metric["goroutines"] = count
									}
									break
								}
							}
						}
					}
				}
			}

			mu.Lock()
			metricsData[s.Name] = metric
			mu.Unlock()
		}(service)
	}

	wg.Wait()
	c.JSON(http.StatusOK, metricsData)
}

// SystemInfoHandler gets detailed system information.
func SystemInfoHandler(c *gin.Context) {
	// CPU
	cpuInfo, _ := cpu.Info()
	cpuUsage, _ := cpu.Percent(0, false)

	// Memory
	memInfo, _ := mem.VirtualMemory()

	// Disk
	diskInfo, _ := disk.Usage("/")

	// Load
	loadAvg, _ := load.Avg()

	// Network
	netIO, _ := net.IOCounters(false)
	netStats := gin.H{"bytesIn": 0, "bytesOut": 0}
	if len(netIO) > 0 {
		netStats["bytesIn"] = netIO[0].BytesRecv
		netStats["bytesOut"] = netIO[0].BytesSent
	}

	// Processes
	serviceProcesses := utils.GetServiceProcesses()

	// Uptime
	uptime, _ := utils.GetUptime()

	c.JSON(http.StatusOK, gin.H{
		"cpu": gin.H{
			"usage": cpuUsage[0],
			"cores": len(cpuInfo),
			"model": cpuInfo[0].ModelName,
		},
		"memory": gin.H{
			"total": memInfo.Total / 1024 / 1024,
			"used":  memInfo.Used / 1024 / 1024,
			"free":  memInfo.Free / 1024 / 1024,
			"usage": memInfo.UsedPercent,
		},
		"disk": gin.H{
			"total": diskInfo.Total / 1024 / 1024 / 1024,
			"used":  diskInfo.Used / 1024 / 1024 / 1024,
			"free":  diskInfo.Free / 1024 / 1024 / 1024,
			"usage": diskInfo.UsedPercent,
		},
		"network":     netStats,
		"uptime":      uptime,
		"loadAverage": []float64{loadAvg.Load1, loadAvg.Load5, loadAvg.Load15},
		"processes":   serviceProcesses,
	})
}

// getOrCreateSession gets or creates a terminal session
func getOrCreateSession(sessionID string) *TerminalSession {
	sessionMutex.Lock()
	defer sessionMutex.Unlock()
	
	if session, exists := terminalSessions[sessionID]; exists {
		session.LastUsed = time.Now()
		return session
	}
	
	// Create new session
	homeDir, _ := os.UserHomeDir()
	if homeDir == "" {
		homeDir = "/root"
	}
	
	session := &TerminalSession{
		ID:          sessionID,
		WorkingDir:  homeDir,
		Environment: make(map[string]string),
		LastUsed:    time.Now(),
	}
	
	terminalSessions[sessionID] = session
	return session
}

// ExecuteCommandHandler executes a command on the server.
func ExecuteCommandHandler(c *gin.Context) {
	var req struct {
		Command   string `json:"command"`
		SessionID string `json:"sessionId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Command is required"})
		return
	}

	// Get or create session
	session := getOrCreateSession(req.SessionID)
	
	// Basic security check
	forbidden := []string{"rm -rf /", "mkfs", "format", "fdisk"}
	for _, f := range forbidden {
		if strings.Contains(strings.ToLower(req.Command), f) {
			c.JSON(http.StatusOK, gin.H{
				"command":   req.Command,
				"sessionId": req.SessionID,
				"stdout":    "",
				"stderr":    "Command not allowed for security reasons",
				"exitCode":  1,
				"timestamp": time.Now().UTC().Format(time.RFC3339),
			})
			return
		}
	}

	// Handle cd command specially
	if strings.HasPrefix(strings.TrimSpace(req.Command), "cd ") {
		handleCdCommand(req.Command, session, c)
		return
	}

	// Execute regular command
	cmd := exec.Command("bash", "-c", req.Command)
	cmd.Dir = session.WorkingDir
	cmd.Env = os.Environ() // Inherit all environment variables
	
	// Add session-specific environment variables
	for k, v := range session.Environment {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	
	output, err := cmd.CombinedOutput()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"command":     req.Command,
		"sessionId":   req.SessionID,
		"stdout":      string(output),
		"stderr":      "",
		"exitCode":    exitCode,
		"workingDir":  session.WorkingDir,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	})
}

// handleCdCommand handles cd command specifically
func handleCdCommand(command string, session *TerminalSession, c *gin.Context) {
	parts := strings.Fields(command)
	var targetDir string
	
	if len(parts) == 1 {
		// cd with no arguments - go to home directory
		homeDir, _ := os.UserHomeDir()
		if homeDir == "" {
			homeDir = "/root"
		}
		targetDir = homeDir
	} else {
		targetDir = parts[1]
	}
	
	// Handle relative paths
	if !filepath.IsAbs(targetDir) {
		targetDir = filepath.Join(session.WorkingDir, targetDir)
	}
	
	// Clean the path
	targetDir = filepath.Clean(targetDir)
	
	// Check if directory exists
	if _, err := os.Stat(targetDir); os.IsNotExist(err) {
		c.JSON(http.StatusOK, gin.H{
			"command":     command,
			"sessionId":   session.ID,
			"stdout":      "",
			"stderr":      "bash: cd: " + parts[1] + ": No such file or directory",
			"exitCode":    1,
			"workingDir":  session.WorkingDir,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	
	// Update session working directory
	sessionMutex.Lock()
	session.WorkingDir = targetDir
	session.LastUsed = time.Now()
	sessionMutex.Unlock()
	
	c.JSON(http.StatusOK, gin.H{
		"command":     command,
		"sessionId":   session.ID,
		"stdout":      "",
		"stderr":      "",
		"exitCode":    0,
		"workingDir":  session.WorkingDir,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	})
}

// HealthCheckHandler returns the health of the service.
func HealthCheckHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

// SystemMetricsHistoryHandler gets historical metrics for all services
func SystemMetricsHistoryHandler(c *gin.Context) {
	// Parse duration parameter (in minutes)
	durationStr := c.DefaultQuery("duration", "60")
	durationMinutes, err := strconv.Atoi(durationStr)
	if err != nil || durationMinutes <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid duration parameter"})
		return
	}
	
	duration := time.Duration(durationMinutes) * time.Minute
	
	// Get all configured service names
	var serviceNames []string
	for _, service := range config.Conf.Services {
		serviceNames = append(serviceNames, service.Name)
	}
	
	// Get historical data from memory store
	historyData := metricsStore.GetHistory(serviceNames, duration)
	
	// Format response according to frontend expectations
	services := make(map[string]gin.H)
	for serviceName, serviceHistory := range historyData {
		// Format data points for frontend
		var dataPoints []gin.H
		for _, point := range serviceHistory.DataPoints {
			dataPoints = append(dataPoints, gin.H{
				"timestamp":          point.Timestamp.UnixMilli(),
				"timestampFormatted": point.Timestamp.Format("15:04:05"),
				"cpu":                point.CPU,
				"memory":             point.Memory,
			})
		}
		
		services[serviceName] = gin.H{
			"serviceName": serviceHistory.ServiceName,
			"status":      serviceHistory.Status,
			"dataPoints":  dataPoints,
		}
	}
	
	now := time.Now()
	startTime := now.Add(-duration)
	
	response := gin.H{
		"services": services,
		"timeRange": gin.H{
			"start":    startTime.UnixMilli(),
			"end":      now.UnixMilli(),
			"duration": durationMinutes,
		},
	}
	
	c.JSON(http.StatusOK, response)
}

// MetricsStatsHandler returns statistics about the metrics storage
func MetricsStatsHandler(c *gin.Context) {
	stats := metricsStore.GetStats()
	c.JSON(http.StatusOK, stats)
}
