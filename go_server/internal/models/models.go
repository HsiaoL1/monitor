package models

import "time"

// LoginCredentials matches the structure of config.json
type LoginCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Service defines a manageable service
type Service struct {
	Name         string `json:"serviceName"`
	Path         string `json:"servicePath"`
	DeployScript string `json:"deployScript"`
	PprofURL     string `json:"pprofUrl,omitempty"`
}

// Environment represents deployment environment
type Environment string

const (
	EnvironmentTest       Environment = "test"
	EnvironmentProduction Environment = "production"
)

// DeploymentStatus represents deployment status
type DeploymentStatus string

const (
	StatusPending   DeploymentStatus = "pending"
	StatusRunning   DeploymentStatus = "running"
	StatusSuccess   DeploymentStatus = "success"
	StatusFailed    DeploymentStatus = "failed"
	StatusRollback  DeploymentStatus = "rollback"
	StatusCancelled DeploymentStatus = "cancelled"
)

// Deployment represents a deployment record
type Deployment struct {
	ID          int64            `json:"id" gorm:"primaryKey"`
	ServiceName string           `json:"serviceName" gorm:"not null;index"`
	Environment Environment     `json:"environment" gorm:"not null;index"`
	Version     string           `json:"version" gorm:"not null"`
	CommitHash  string           `json:"commitHash" gorm:"not null"`
	CommitMsg   string           `json:"commitMessage"`
	Branch      string           `json:"branch" gorm:"not null"`
	Status      DeploymentStatus `json:"status" gorm:"not null;index"`
	StartTime   time.Time        `json:"startTime"`
	EndTime     *time.Time       `json:"endTime,omitempty"`
	Duration    int64            `json:"duration"` // seconds
	DeployedBy  string           `json:"deployedBy"`
	BuildLog    string           `json:"buildLog" gorm:"type:text"`
	ErrorMsg    string           `json:"errorMessage"`
	CreatedAt   time.Time        `json:"createdAt"`
	UpdatedAt   time.Time        `json:"updatedAt"`
}

// ServiceEnvironment represents service status in specific environment
type ServiceEnvironment struct {
	ID              int64       `json:"id" gorm:"primaryKey"`
	ServiceName     string      `json:"serviceName" gorm:"not null;uniqueIndex:idx_service_env"`
	Environment     Environment `json:"environment" gorm:"not null;uniqueIndex:idx_service_env"`
	CurrentVersion  string      `json:"currentVersion"`
	CurrentCommit   string      `json:"currentCommit"`
	DeploymentID    *int64      `json:"deploymentId,omitempty"`
	LastDeployedAt  *time.Time  `json:"lastDeployedAt,omitempty"`
	IsHealthy       bool        `json:"isHealthy" gorm:"default:true"`
	HealthCheckURL  string      `json:"healthCheckUrl"`
	GitRepository   string      `json:"gitRepository"`
	TestRepository  string      `json:"testRepository"`
	ProdRepository  string      `json:"prodRepository"`
	CreatedAt       time.Time   `json:"createdAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
}

// DeploymentRequest represents a deployment request
type DeploymentRequest struct {
	ServiceName string      `json:"serviceName" binding:"required"`
	Environment Environment `json:"environment" binding:"required"`
	Branch      string      `json:"branch" binding:"required"`
	CommitHash  string      `json:"commitHash,omitempty"`
	DeployedBy  string      `json:"deployedBy" binding:"required"`
	Force       bool        `json:"force,omitempty"`
}

// RollbackRequest represents a rollback request
type RollbackRequest struct {
	ServiceName    string      `json:"serviceName" binding:"required"`
	Environment    Environment `json:"environment" binding:"required"`
	TargetVersion  string      `json:"targetVersion,omitempty"`
	DeploymentID   int64       `json:"deploymentId,omitempty"`
	RollbackBy     string      `json:"rollbackBy" binding:"required"`
}

// DeploymentStats represents deployment statistics
type DeploymentStats struct {
	ServiceName      string  `json:"serviceName"`
	Environment      string  `json:"environment"`
	TotalDeployments int64   `json:"totalDeployments"`
	SuccessCount     int64   `json:"successCount"`
	FailureCount     int64   `json:"failureCount"`
	SuccessRate      float64 `json:"successRate"`
	AvgDuration      float64 `json:"avgDuration"`
	LastDeployment   *time.Time `json:"lastDeployment,omitempty"`
}

// PromoteRequest represents a promote from test to production request
type PromoteRequest struct {
	ServiceName string `json:"serviceName" binding:"required"`
	Version     string `json:"version" binding:"required"`
	CommitHash  string `json:"commitHash" binding:"required"`
	PromotedBy  string `json:"promotedBy" binding:"required"`
}
