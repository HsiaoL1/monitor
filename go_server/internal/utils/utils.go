package utils

import (
	"context"
	"control/go_server/config"
	"control/go_server/internal/models"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/shirou/gopsutil/v3/process"
	"github.com/gin-gonic/gin"
)

var ctx = context.Background()

// FindPidsByName finds process IDs by a service name.
func FindPidsByName(name string) ([]int32, error) {
	processes, err := process.Processes()
	if err != nil {
		return nil, err
	}

	var pids []int32
	for _, p := range processes {
		// 先检查进程名
		processName, err := p.Name()
		if err == nil && strings.Contains(processName, name) {
			pids = append(pids, p.Pid)
			continue
		}
		
		// 再检查命令行（更全面的匹配）
		cmdline, err := p.Cmdline()
		if err != nil {
			continue
		}
		
		// 检查命令行中是否包含服务名
		if strings.Contains(cmdline, name) {
			// 避免误匹配（例如路径中包含服务名但不是实际服务）
			// 检查是否是可执行文件或包含服务名的路径
			if strings.Contains(cmdline, fmt.Sprintf("/%s", name)) || 
			   strings.HasSuffix(cmdline, name) || 
			   strings.Contains(cmdline, fmt.Sprintf("%s ", name)) {
				pids = append(pids, p.Pid)
			}
		}
	}
	return pids, nil
}

// FindServiceByName finds a service from the config by its name.
func FindServiceByName(name string) (models.Service, bool) {
	for _, s := range config.Conf.Services {
		if s.Name == name {
			return s, true
		}
	}
	return models.Service{}, false
}

// ConnectRedis establishes a connection to the Redis server.
func ConnectRedis() (*redis.Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", config.Conf.Redis.Host, config.Conf.Redis.Port),
		Password: config.Conf.Redis.Password,
		DB:       config.Conf.Redis.DB,
	})
	_, err := rdb.Ping(ctx).Result()
	return rdb, err
}

// GetServiceProcesses gets detailed information about running services.
func GetServiceProcesses() []gin.H {
	var serviceProcesses []gin.H
	for _, service := range config.Conf.Services {
		pids, _ := FindPidsByName(service.Name)
		if len(pids) > 0 {
			for _, pid := range pids {
				proc, err := process.NewProcess(pid)
				if err != nil {
					continue
				}
				cpuPercent, _ := proc.CPUPercent()
				memInfo, _ := proc.MemoryInfo()
				serviceProcesses = append(serviceProcesses, gin.H{
					"pid":         pid,
					"name":        service.Name,
					"cpu":         cpuPercent,
					"memory":      float64(memInfo.RSS) / 1024 / 1024, // MB
					"status":      "running",
					"serviceName": service.Name,
				})
			}
		}
	}
	return serviceProcesses
}

// GetUptime gets the system uptime.
func GetUptime() (uint64, error) {
	out, err := exec.Command("uptime", "-s").Output()
	if err != nil {
		return 0, err
	}
	startTimeStr := strings.TrimSpace(string(out))
	startTime, err := time.Parse("2006-01-02 15:04:05", startTimeStr)
	if err != nil {
		return 0, err
	}
	return uint64(time.Since(startTime).Seconds()), nil
}

// GetProcessPorts gets listening ports for a given process ID.
func GetProcessPorts(pid int32) ([]string, error) {
	// 优先使用 ss 命令，更现代和可靠
	ports, err := getProcessPortsWithSS(pid)
	if err == nil && len(ports) > 0 {
		return ports, nil
	}
	
	// 如果 ss 不可用或没有结果，fallback 到 netstat
	return getProcessPortsWithNetstat(pid)
}

// getProcessPortsWithSS uses ss command to find ports for a process
func getProcessPortsWithSS(pid int32) ([]string, error) {
	cmd := exec.Command("ss", "-tlnp")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var ports []string
	lines := strings.Split(string(output), "\n")
	pidStr := fmt.Sprintf("pid=%d", pid)

	for _, line := range lines {
		if strings.Contains(line, pidStr) && strings.Contains(line, "LISTEN") {
			fields := strings.Fields(line)
			if len(fields) >= 4 {
				// ss 命令中地址在第4列 (0-based index 3)
				addr := fields[3]
				if colonIndex := strings.LastIndex(addr, ":"); colonIndex != -1 {
					port := addr[colonIndex+1:]
					if port != "0" && !containsString(ports, port) {
						ports = append(ports, port)
					}
				}
			}
		}
	}

	return ports, nil
}

// getProcessPortsWithNetstat uses netstat as fallback
func getProcessPortsWithNetstat(pid int32) ([]string, error) {
	cmd := exec.Command("netstat", "-tlnp")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var ports []string
	lines := strings.Split(string(output), "\n")
	pidStr := fmt.Sprintf("/%d/", pid)

	for _, line := range lines {
		if strings.Contains(line, pidStr) && strings.Contains(line, "LISTEN") {
			fields := strings.Fields(line)
			if len(fields) >= 4 {
				// Extract port from address (format: 0.0.0.0:port or :::port)
				addr := fields[3]
				parts := strings.Split(addr, ":")
				if len(parts) >= 2 {
					port := parts[len(parts)-1]
					if port != "0" && !containsString(ports, port) {
						ports = append(ports, port)
					}
				}
			}
		}
	}

	return ports, nil
}

// containsString checks if a string slice contains a specific string
func containsString(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// GetServicePorts gets all listening ports for a service by name.
func GetServicePorts(serviceName string) ([]string, error) {
	pids, err := FindPidsByName(serviceName)
	if err != nil {
		return nil, err
	}

	if len(pids) == 0 {
		return []string{}, nil
	}

	var allPorts []string
	for _, pid := range pids {
		ports, err := GetProcessPorts(pid)
		if err != nil {
			// 记录错误但继续处理其他进程
			continue
		}
		
		// Merge ports avoiding duplicates using helper function
		for _, port := range ports {
			if !containsString(allPorts, port) {
				allPorts = append(allPorts, port)
			}
		}
	}

	return allPorts, nil
}
