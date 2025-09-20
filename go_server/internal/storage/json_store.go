package storage

import (
	"control/go_server/internal/models"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// JSONCICDStore implements CI/CD storage using JSON files
type JSONCICDStore struct {
	dataDir         string
	deploymentFile  string
	environmentFile string
	mutex           sync.RWMutex
	nextID          int64
}

// NewJSONCICDStore creates a new JSON-based CI/CD store
func NewJSONCICDStore(dataDir string) *JSONCICDStore {
	store := &JSONCICDStore{
		dataDir:         dataDir,
		deploymentFile:  filepath.Join(dataDir, "deployments.json"),
		environmentFile: filepath.Join(dataDir, "environments.json"),
		nextID:          1,
	}

	// Ensure data directory exists
	os.MkdirAll(dataDir, 0755)

	// Load existing data to determine next ID
	store.loadNextID()

	return store
}

// AutoMigrate creates the necessary files (equivalent to table creation)
func (s *JSONCICDStore) AutoMigrate() error {
	// Create empty files if they don't exist
	if _, err := os.Stat(s.deploymentFile); os.IsNotExist(err) {
		if err := s.saveDeployments([]models.Deployment{}); err != nil {
			return fmt.Errorf("failed to create deployments file: %v", err)
		}
	}

	if _, err := os.Stat(s.environmentFile); os.IsNotExist(err) {
		if err := s.saveEnvironments([]models.ServiceEnvironment{}); err != nil {
			return fmt.Errorf("failed to create environments file: %v", err)
		}
	}

	return nil
}

// loadNextID determines the next available ID
func (s *JSONCICDStore) loadNextID() {
	deployments, _ := s.loadDeployments()
	maxID := int64(0)
	for _, d := range deployments {
		if d.ID > maxID {
			maxID = d.ID
		}
	}
	s.nextID = maxID + 1
}

// loadDeployments loads all deployments from file
func (s *JSONCICDStore) loadDeployments() ([]models.Deployment, error) {
	var deployments []models.Deployment
	data, err := os.ReadFile(s.deploymentFile)
	if err != nil {
		if os.IsNotExist(err) {
			return deployments, nil
		}
		return nil, err
	}

	if len(data) == 0 {
		return deployments, nil
	}

	err = json.Unmarshal(data, &deployments)
	return deployments, err
}

// saveDeployments saves all deployments to file
func (s *JSONCICDStore) saveDeployments(deployments []models.Deployment) error {
	data, err := json.MarshalIndent(deployments, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.deploymentFile, data, 0644)
}

// loadEnvironments loads all service environments from file
func (s *JSONCICDStore) loadEnvironments() ([]models.ServiceEnvironment, error) {
	var environments []models.ServiceEnvironment
	data, err := os.ReadFile(s.environmentFile)
	if err != nil {
		if os.IsNotExist(err) {
			return environments, nil
		}
		return nil, err
	}

	if len(data) == 0 {
		return environments, nil
	}

	err = json.Unmarshal(data, &environments)
	return environments, err
}

// saveEnvironments saves all service environments to file
func (s *JSONCICDStore) saveEnvironments(environments []models.ServiceEnvironment) error {
	data, err := json.MarshalIndent(environments, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.environmentFile, data, 0644)
}

// CreateDeployment creates a new deployment record
func (s *JSONCICDStore) CreateDeployment(deployment *models.Deployment) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return err
	}

	deployment.ID = s.nextID
	s.nextID++
	deployment.CreatedAt = time.Now()
	deployment.UpdatedAt = time.Now()

	deployments = append(deployments, *deployment)
	return s.saveDeployments(deployments)
}

// UpdateDeployment updates deployment status and logs
func (s *JSONCICDStore) UpdateDeployment(id int64, updates map[string]interface{}) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return err
	}

	for i, d := range deployments {
		if d.ID == id {
			// Apply updates
			if status, ok := updates["status"]; ok {
				if statusStr, ok := status.(models.DeploymentStatus); ok {
					deployments[i].Status = statusStr
				}
			}
			if endTime, ok := updates["end_time"]; ok {
				if t, ok := endTime.(time.Time); ok {
					deployments[i].EndTime = &t
				}
			}
			if duration, ok := updates["duration"]; ok {
				if d, ok := duration.(int64); ok {
					deployments[i].Duration = d
				}
			}
			if buildLog, ok := updates["build_log"]; ok {
				if log, ok := buildLog.(string); ok {
					deployments[i].BuildLog = log
				}
			}
			if errorMsg, ok := updates["error_msg"]; ok {
				if msg, ok := errorMsg.(string); ok {
					deployments[i].ErrorMsg = msg
				}
			}
			deployments[i].UpdatedAt = time.Now()
			break
		}
	}

	return s.saveDeployments(deployments)
}

// GetDeployment gets deployment by ID
func (s *JSONCICDStore) GetDeployment(id int64) (*models.Deployment, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return nil, err
	}

	for _, d := range deployments {
		if d.ID == id {
			return &d, nil
		}
	}

	return nil, fmt.Errorf("deployment not found")
}

// GetDeploymentHistory gets deployment history for a service
func (s *JSONCICDStore) GetDeploymentHistory(serviceName string, environment models.Environment, limit int) ([]*models.Deployment, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return nil, err
	}

	var filtered []*models.Deployment
	for _, d := range deployments {
		if d.ServiceName == serviceName && (environment == "" || d.Environment == environment) {
			deployment := d
			filtered = append(filtered, &deployment)
		}
	}

	// Sort by creation time (newest first)
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].CreatedAt.After(filtered[j].CreatedAt)
	})

	if limit > 0 && len(filtered) > limit {
		filtered = filtered[:limit]
	}

	return filtered, nil
}

// GetAllDeploymentHistory gets deployment history for all services
func (s *JSONCICDStore) GetAllDeploymentHistory(limit int) ([]*models.Deployment, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return nil, err
	}

	var result []*models.Deployment
	for _, d := range deployments {
		deployment := d
		result = append(result, &deployment)
	}

	// Sort by creation time (newest first)
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})

	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}

	return result, nil
}

// GetRunningDeployments gets all running deployments
func (s *JSONCICDStore) GetRunningDeployments() ([]*models.Deployment, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return nil, err
	}

	var running []*models.Deployment
	for _, d := range deployments {
		if d.Status == models.StatusRunning {
			deployment := d
			running = append(running, &deployment)
		}
	}

	return running, nil
}

// CreateOrUpdateServiceEnvironment creates or updates service environment info
func (s *JSONCICDStore) CreateOrUpdateServiceEnvironment(serviceEnv *models.ServiceEnvironment) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	environments, err := s.loadEnvironments()
	if err != nil {
		return err
	}

	// Find existing environment
	found := false
	for i, env := range environments {
		if env.ServiceName == serviceEnv.ServiceName && env.Environment == serviceEnv.Environment {
			// Update existing
			environments[i] = *serviceEnv
			environments[i].UpdatedAt = time.Now()
			found = true
			break
		}
	}

	if !found {
		// Create new
		serviceEnv.CreatedAt = time.Now()
		serviceEnv.UpdatedAt = time.Now()
		environments = append(environments, *serviceEnv)
	}

	return s.saveEnvironments(environments)
}

// Implement other required methods...
// (For brevity, I'll implement the most commonly used ones. You can add others as needed)

// GetServiceEnvironment gets service environment info
func (s *JSONCICDStore) GetServiceEnvironment(serviceName string, environment models.Environment) (*models.ServiceEnvironment, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	environments, err := s.loadEnvironments()
	if err != nil {
		return nil, err
	}

	for _, env := range environments {
		if env.ServiceName == serviceName && env.Environment == environment {
			return &env, nil
		}
	}

	return nil, fmt.Errorf("service environment not found")
}

// GetAllServiceEnvironments gets all service environments
func (s *JSONCICDStore) GetAllServiceEnvironments() ([]*models.ServiceEnvironment, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	environments, err := s.loadEnvironments()
	if err != nil {
		return nil, err
	}

	var result []*models.ServiceEnvironment
	for _, env := range environments {
		environment := env
		result = append(result, &environment)
	}

	return result, nil
}

// GetDeploymentStats gets deployment statistics
func (s *JSONCICDStore) GetDeploymentStats(serviceName string, environment models.Environment, days int) (*models.DeploymentStats, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return nil, err
	}

	// Filter deployments based on criteria
	var filtered []models.Deployment
	cutoffTime := time.Now().AddDate(0, 0, -days)

	for _, d := range deployments {
		if serviceName != "" && d.ServiceName != serviceName {
			continue
		}
		if environment != "" && d.Environment != environment {
			continue
		}
		if days > 0 && d.CreatedAt.Before(cutoffTime) {
			continue
		}
		filtered = append(filtered, d)
	}

	// Calculate statistics
	stats := &models.DeploymentStats{
		ServiceName:      serviceName,
		Environment:      string(environment),
		TotalDeployments: int64(len(filtered)),
	}

	var successCount, failureCount int64
	var totalDuration int64
	var lastDeployment *time.Time

	for _, d := range filtered {
		if d.Status == models.StatusSuccess {
			successCount++
			totalDuration += d.Duration
		} else if d.Status == models.StatusFailed {
			failureCount++
		}

		if lastDeployment == nil || d.CreatedAt.After(*lastDeployment) {
			lastDeployment = &d.CreatedAt
		}
	}

	stats.SuccessCount = successCount
	stats.FailureCount = failureCount
	stats.LastDeployment = lastDeployment

	if stats.TotalDeployments > 0 {
		stats.SuccessRate = float64(successCount) / float64(stats.TotalDeployments) * 100
	}

	if successCount > 0 {
		stats.AvgDuration = float64(totalDuration) / float64(successCount)
	}

	return stats, nil
}

func (s *JSONCICDStore) GetLatestSuccessfulDeployment(serviceName string, environment models.Environment, excludeID int64) (*models.Deployment, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return nil, err
	}

	var latest *models.Deployment
	for _, d := range deployments {
		if d.ServiceName == serviceName &&
		   d.Environment == environment &&
		   d.Status == models.StatusSuccess &&
		   (excludeID == 0 || d.ID != excludeID) {
			if latest == nil || d.CreatedAt.After(latest.CreatedAt) {
				deployment := d
				latest = &deployment
			}
		}
	}

	if latest == nil {
		return nil, fmt.Errorf("no successful deployment found")
	}
	return latest, nil
}

func (s *JSONCICDStore) UpdateServiceHealthStatus(serviceName string, environment models.Environment, isHealthy bool) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	environments, err := s.loadEnvironments()
	if err != nil {
		return err
	}

	// Find and update the specific environment
	for i, env := range environments {
		if env.ServiceName == serviceName && env.Environment == environment {
			environments[i].IsHealthy = isHealthy
			environments[i].UpdatedAt = time.Now()
			return s.saveEnvironments(environments)
		}
	}

	return fmt.Errorf("service environment not found")
}

func (s *JSONCICDStore) CleanupOldDeployments(keepCount int) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	deployments, err := s.loadDeployments()
	if err != nil {
		return err
	}

	if len(deployments) <= keepCount {
		return nil // Nothing to cleanup
	}

	// Sort by creation time (newest first)
	sort.Slice(deployments, func(i, j int) bool {
		return deployments[i].CreatedAt.After(deployments[j].CreatedAt)
	})

	// Keep only the most recent deployments
	if len(deployments) > keepCount {
		deployments = deployments[:keepCount]
	}

	return s.saveDeployments(deployments)
}