package storage

import (
	"control/go_server/db"
	"control/go_server/internal/models"
	"fmt"
	"time"

	"gorm.io/gorm"
)

type CICDStore struct {
	db        *gorm.DB
	jsonStore *JSONCICDStore
}

func NewCICDStore() *CICDStore {
	// If SQLite initialization failed, fall back to JSON store
	if db.CicdDB == nil {
		// Use JSON store as fallback
		jsonStore := NewJSONCICDStore("./data")
		return &CICDStore{db: nil, jsonStore: jsonStore}
	}
	return &CICDStore{db: db.CicdDB}
}

// AutoMigrate creates the CI/CD tables or initializes JSON storage
func (s *CICDStore) AutoMigrate() error {
	if s.db != nil {
		return s.db.AutoMigrate(
			&models.Deployment{},
			&models.ServiceEnvironment{},
		)
	} else if s.jsonStore != nil {
		return s.jsonStore.AutoMigrate()
	}
	return fmt.Errorf("no storage backend available")
}

// CreateDeployment creates a new deployment record
func (s *CICDStore) CreateDeployment(deployment *models.Deployment) error {
	if s.db != nil {
		deployment.CreatedAt = time.Now()
		deployment.UpdatedAt = time.Now()
		return s.db.Create(deployment).Error
	} else if s.jsonStore != nil {
		return s.jsonStore.CreateDeployment(deployment)
	}
	return fmt.Errorf("no storage backend available")
}

// UpdateDeployment updates deployment status and logs
func (s *CICDStore) UpdateDeployment(id int64, updates map[string]interface{}) error {
	if s.db != nil {
		updates["updated_at"] = time.Now()
		return s.db.Model(&models.Deployment{}).Where("id = ?", id).Updates(updates).Error
	} else if s.jsonStore != nil {
		return s.jsonStore.UpdateDeployment(id, updates)
	}
	return fmt.Errorf("no storage backend available")
}

// GetDeployment gets deployment by ID
func (s *CICDStore) GetDeployment(id int64) (*models.Deployment, error) {
	if s.db != nil {
		var deployment models.Deployment
		err := s.db.First(&deployment, id).Error
		if err != nil {
			return nil, err
		}
		return &deployment, nil
	} else if s.jsonStore != nil {
		return s.jsonStore.GetDeployment(id)
	}
	return nil, fmt.Errorf("no storage backend available")
}

// GetDeploymentHistory gets deployment history for a service
func (s *CICDStore) GetDeploymentHistory(serviceName string, environment models.Environment, limit int) ([]*models.Deployment, error) {
	if s.db != nil {
		var deployments []*models.Deployment
		query := s.db.Where("service_name = ?", serviceName)

		if environment != "" {
			query = query.Where("environment = ?", environment)
		}

		err := query.Order("created_at DESC").Limit(limit).Find(&deployments).Error
		return deployments, err
	} else if s.jsonStore != nil {
		return s.jsonStore.GetDeploymentHistory(serviceName, environment, limit)
	}
	return nil, fmt.Errorf("no storage backend available")
}

// GetAllDeploymentHistory gets deployment history for all services
func (s *CICDStore) GetAllDeploymentHistory(limit int) ([]*models.Deployment, error) {
	if s.db != nil {
		var deployments []*models.Deployment
		err := s.db.Order("created_at DESC").Limit(limit).Find(&deployments).Error
		return deployments, err
	} else if s.jsonStore != nil {
		return s.jsonStore.GetAllDeploymentHistory(limit)
	}
	return nil, fmt.Errorf("no storage backend available")
}

// GetRunningDeployments gets all running deployments
func (s *CICDStore) GetRunningDeployments() ([]*models.Deployment, error) {
	if s.db != nil {
		var deployments []*models.Deployment
		err := s.db.Where("status = ?", models.StatusRunning).Find(&deployments).Error
		return deployments, err
	} else if s.jsonStore != nil {
		return s.jsonStore.GetRunningDeployments()
	}
	return nil, fmt.Errorf("no storage backend available")
}

// CreateOrUpdateServiceEnvironment creates or updates service environment info
func (s *CICDStore) CreateOrUpdateServiceEnvironment(serviceEnv *models.ServiceEnvironment) error {
	if s.db != nil {
		serviceEnv.UpdatedAt = time.Now()

		var existing models.ServiceEnvironment
		err := s.db.Where("service_name = ? AND environment = ?",
			serviceEnv.ServiceName, serviceEnv.Environment).First(&existing).Error

		if err == gorm.ErrRecordNotFound {
			serviceEnv.CreatedAt = time.Now()
			return s.db.Create(serviceEnv).Error
		} else if err != nil {
			return err
		}

		// Update existing record
		return s.db.Model(&existing).Updates(map[string]any{
			"current_version":  serviceEnv.CurrentVersion,
			"current_commit":   serviceEnv.CurrentCommit,
			"deployment_id":    serviceEnv.DeploymentID,
			"last_deployed_at": serviceEnv.LastDeployedAt,
			"is_healthy":       serviceEnv.IsHealthy,
			"updated_at":       time.Now(),
		}).Error
	} else if s.jsonStore != nil {
		return s.jsonStore.CreateOrUpdateServiceEnvironment(serviceEnv)
	}
	return fmt.Errorf("no storage backend available")
}

// GetServiceEnvironment gets service environment info
func (s *CICDStore) GetServiceEnvironment(serviceName string, environment models.Environment) (*models.ServiceEnvironment, error) {
	if s.db != nil {
		var serviceEnv models.ServiceEnvironment
		err := s.db.Where("service_name = ? AND environment = ?", serviceName, environment).First(&serviceEnv).Error
		if err != nil {
			return nil, err
		}
		return &serviceEnv, nil
	} else if s.jsonStore != nil {
		return s.jsonStore.GetServiceEnvironment(serviceName, environment)
	}
	return nil, fmt.Errorf("no storage backend available")
}

// GetAllServiceEnvironments gets all service environments
func (s *CICDStore) GetAllServiceEnvironments() ([]*models.ServiceEnvironment, error) {
	if s.db != nil {
		var serviceEnvs []*models.ServiceEnvironment
		err := s.db.Order("service_name, environment").Find(&serviceEnvs).Error
		return serviceEnvs, err
	} else if s.jsonStore != nil {
		return s.jsonStore.GetAllServiceEnvironments()
	}
	return nil, fmt.Errorf("no storage backend available")
}

// GetDeploymentStats gets deployment statistics
func (s *CICDStore) GetDeploymentStats(serviceName string, environment models.Environment, days int) (*models.DeploymentStats, error) {
	if s.db != nil {
		var stats models.DeploymentStats

		query := s.db.Model(&models.Deployment{})
		if serviceName != "" {
			query = query.Where("service_name = ?", serviceName)
		}
		if environment != "" {
			query = query.Where("environment = ?", environment)
		}
		if days > 0 {
			query = query.Where("created_at >= ?", time.Now().AddDate(0, 0, -days))
		}

		// Get basic counts
		var totalCount, successCount, failureCount int64
		query.Count(&totalCount)
		query.Where("status = ?", models.StatusSuccess).Count(&successCount)
		query.Where("status = ?", models.StatusFailed).Count(&failureCount)

		stats.TotalDeployments = totalCount
		stats.SuccessCount = successCount
		stats.FailureCount = failureCount

		if totalCount > 0 {
			stats.SuccessRate = float64(successCount) / float64(totalCount) * 100
		}

		// Get average duration
		var avgDuration float64
		s.db.Model(&models.Deployment{}).
			Select("AVG(duration) as avg_duration").
			Where("status = ? AND duration > 0", models.StatusSuccess).
			Scan(&avgDuration)
		stats.AvgDuration = avgDuration

		// Get last deployment
		var lastDeployment models.Deployment
		err := query.Order("created_at DESC").First(&lastDeployment).Error
		if err == nil {
			stats.LastDeployment = &lastDeployment.CreatedAt
		}

		stats.ServiceName = serviceName
		stats.Environment = string(environment)

		return &stats, nil
	} else if s.jsonStore != nil {
		return s.jsonStore.GetDeploymentStats(serviceName, environment, days)
	}
	return nil, fmt.Errorf("no storage backend available")
}

// GetLatestSuccessfulDeployment gets the latest successful deployment for rollback
func (s *CICDStore) GetLatestSuccessfulDeployment(serviceName string, environment models.Environment, excludeID int64) (*models.Deployment, error) {
	if s.db != nil {
		var deployment models.Deployment
		query := s.db.Where("service_name = ? AND environment = ? AND status = ?",
			serviceName, environment, models.StatusSuccess)

		if excludeID > 0 {
			query = query.Where("id != ?", excludeID)
		}

		err := query.Order("created_at DESC").First(&deployment).Error
		if err != nil {
			return nil, err
		}
		return &deployment, nil
	} else if s.jsonStore != nil {
		return s.jsonStore.GetLatestSuccessfulDeployment(serviceName, environment, excludeID)
	}
	return nil, fmt.Errorf("no storage backend available")
}

// UpdateServiceHealthStatus updates service health status
func (s *CICDStore) UpdateServiceHealthStatus(serviceName string, environment models.Environment, isHealthy bool) error {
	if s.db != nil {
		return s.db.Model(&models.ServiceEnvironment{}).
			Where("service_name = ? AND environment = ?", serviceName, environment).
			Update("is_healthy", isHealthy).Error
	} else if s.jsonStore != nil {
		return s.jsonStore.UpdateServiceHealthStatus(serviceName, environment, isHealthy)
	}
	return fmt.Errorf("no storage backend available")
}

// CleanupOldDeployments removes old deployment records (keep last N records per service/environment)
func (s *CICDStore) CleanupOldDeployments(keepCount int) error {
	if s.db != nil {
		// This is a complex query that would keep the latest N deployments per service/environment
		// For now, we'll implement a simple cleanup based on age
		cutoffDate := time.Now().AddDate(0, -3, 0) // Keep last 3 months
		return s.db.Where("created_at < ? AND status != ?", cutoffDate, models.StatusRunning).
			Delete(&models.Deployment{}).Error
	} else if s.jsonStore != nil {
		return s.jsonStore.CleanupOldDeployments(keepCount)
	}
	return fmt.Errorf("no storage backend available")
}
