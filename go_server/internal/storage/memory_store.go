package storage

import (
	"sync"
	"time"
)

// MetricPoint represents a single metric data point
type MetricPoint struct {
	Timestamp time.Time `json:"timestamp"`
	CPU       float64   `json:"cpu"`
	Memory    float64   `json:"memory"`
}

// ServiceHistory stores historical data for a service
type ServiceHistory struct {
	ServiceName string        `json:"serviceName"`
	Status      string        `json:"status"`
	DataPoints  []MetricPoint `json:"dataPoints"`
}

// MemoryStore manages in-memory storage for metrics history
type MemoryStore struct {
	data     map[string][]MetricPoint // serviceName -> data points
	mutex    sync.RWMutex
	maxAge   time.Duration // maximum age to keep data
	interval time.Duration // cleanup interval
}

// NewMemoryStore creates a new memory store with cleanup routine
func NewMemoryStore() *MemoryStore {
	store := &MemoryStore{
		data:     make(map[string][]MetricPoint),
		maxAge:   24 * time.Hour, // keep 24 hours of data
		interval: 10 * time.Minute, // cleanup every 10 minutes
	}
	
	// Start cleanup routine
	go store.cleanupRoutine()
	
	return store
}

// AddMetric adds a new metric point for a service
func (ms *MemoryStore) AddMetric(serviceName string, cpu, memory float64) {
	ms.mutex.Lock()
	defer ms.mutex.Unlock()
	
	point := MetricPoint{
		Timestamp: time.Now(),
		CPU:       cpu,
		Memory:    memory,
	}
	
	ms.data[serviceName] = append(ms.data[serviceName], point)
	
	// Immediate cleanup if too many points (prevent memory leaks)
	if len(ms.data[serviceName]) > 17280 { // 24h * 60min * 12 (5sec intervals)
		ms.data[serviceName] = ms.data[serviceName][1:]
	}
}

// GetHistory returns historical data for specified services within time range
func (ms *MemoryStore) GetHistory(serviceNames []string, duration time.Duration) map[string]ServiceHistory {
	ms.mutex.RLock()
	defer ms.mutex.RUnlock()
	
	result := make(map[string]ServiceHistory)
	since := time.Now().Add(-duration)
	
	for _, serviceName := range serviceNames {
		dataPoints, exists := ms.data[serviceName]
		if !exists {
			// Return empty history for non-existent services
			result[serviceName] = ServiceHistory{
				ServiceName: serviceName,
				Status:      "unknown",
				DataPoints:  []MetricPoint{},
			}
			continue
		}
		
		// Filter data points within time range
		var filteredPoints []MetricPoint
		for _, point := range dataPoints {
			if point.Timestamp.After(since) {
				filteredPoints = append(filteredPoints, point)
			}
		}
		
		// Determine status based on recent data
		status := "stopped"
		if len(filteredPoints) > 0 {
			// If we have recent data, assume service is running
			lastPoint := filteredPoints[len(filteredPoints)-1]
			if time.Since(lastPoint.Timestamp) < 2*time.Minute {
				status = "running"
			}
		}
		
		result[serviceName] = ServiceHistory{
			ServiceName: serviceName,
			Status:      status,
			DataPoints:  filteredPoints,
		}
	}
	
	return result
}

// GetAllServices returns all services that have historical data
func (ms *MemoryStore) GetAllServices() []string {
	ms.mutex.RLock()
	defer ms.mutex.RUnlock()
	
	services := make([]string, 0, len(ms.data))
	for serviceName := range ms.data {
		services = append(services, serviceName)
	}
	return services
}

// cleanupRoutine periodically removes old data points
func (ms *MemoryStore) cleanupRoutine() {
	ticker := time.NewTicker(ms.interval)
	defer ticker.Stop()
	
	for range ticker.C {
		ms.cleanup()
	}
}

// cleanup removes data points older than maxAge
func (ms *MemoryStore) cleanup() {
	ms.mutex.Lock()
	defer ms.mutex.Unlock()
	
	cutoff := time.Now().Add(-ms.maxAge)
	
	for serviceName, points := range ms.data {
		// Find first point that should be kept
		keepIndex := 0
		for i, point := range points {
			if point.Timestamp.After(cutoff) {
				keepIndex = i
				break
			}
		}
		
		// Keep only recent points
		if keepIndex > 0 {
			ms.data[serviceName] = points[keepIndex:]
		}
		
		// Remove service entry if no data points left
		if len(ms.data[serviceName]) == 0 {
			delete(ms.data, serviceName)
		}
	}
}

// GetStats returns storage statistics
func (ms *MemoryStore) GetStats() map[string]interface{} {
	ms.mutex.RLock()
	defer ms.mutex.RUnlock()
	
	totalPoints := 0
	serviceCount := len(ms.data)
	
	oldestTime := time.Now()
	newestTime := time.Time{}
	
	for _, points := range ms.data {
		totalPoints += len(points)
		if len(points) > 0 {
			if points[0].Timestamp.Before(oldestTime) {
				oldestTime = points[0].Timestamp
			}
			if points[len(points)-1].Timestamp.After(newestTime) {
				newestTime = points[len(points)-1].Timestamp
			}
		}
	}
	
	return map[string]interface{}{
		"serviceCount": serviceCount,
		"totalPoints":  totalPoints,
		"oldestData":   oldestTime.Format(time.RFC3339),
		"newestData":   newestTime.Format(time.RFC3339),
		"maxAge":       ms.maxAge.String(),
	}
}