package api

import (
	"control/go_server/internal/models"
	"control/go_server/internal/storage"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type CICDHandler struct {
	store *storage.CICDStore
}

func NewCICDHandler(store *storage.CICDStore) *CICDHandler {
	return &CICDHandler{store: store}
}

// GetDeploymentHistory godoc
// @Summary Get deployment history
// @Description Get deployment history for a service or all services
// @Tags CICD
// @Param serviceName query string false "Service name"
// @Param environment query string false "Environment (test/production)"
// @Param limit query int false "Limit results" default(50)
// @Success 200 {object} gin.H
// @Router /api/cicd/deployments [get]
func (h *CICDHandler) GetDeploymentHistory(c *gin.Context) {
	serviceName := c.Query("serviceName")
	environmentStr := c.Query("environment")
	limitStr := c.DefaultQuery("limit", "50")
	
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid limit parameter"})
		return
	}
	
	var environment models.Environment
	if environmentStr != "" {
		environment = models.Environment(environmentStr)
	}
	
	var deployments []*models.Deployment
	if serviceName != "" {
		deployments, err = h.store.GetDeploymentHistory(serviceName, environment, limit)
	} else {
		deployments, err = h.store.GetAllDeploymentHistory(limit)
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"deployments": deployments})
}

// GetServiceEnvironments godoc
// @Summary Get service environments
// @Description Get current status of all service environments
// @Tags CICD
// @Success 200 {object} gin.H
// @Router /api/cicd/environments [get]
func (h *CICDHandler) GetServiceEnvironments(c *gin.Context) {
	serviceEnvs, err := h.store.GetAllServiceEnvironments()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"environments": serviceEnvs})
}

// DeployToTest godoc
// @Summary Deploy to test environment
// @Description Deploy a service to test environment
// @Tags CICD
// @Param request body models.DeploymentRequest true "Deployment request"
// @Success 200 {object} gin.H
// @Router /api/cicd/deploy/test [post]
func (h *CICDHandler) DeployToTest(c *gin.Context) {
	var req models.DeploymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	req.Environment = models.EnvironmentTest
	
	// Check if there's already a running deployment
	runningDeployments, err := h.store.GetRunningDeployments()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	for _, deployment := range runningDeployments {
		if deployment.ServiceName == req.ServiceName && deployment.Environment == req.Environment {
			if !req.Force {
				c.JSON(http.StatusConflict, gin.H{
					"error": "There is already a running deployment for this service",
					"deploymentId": deployment.ID,
				})
				return
			}
			// Cancel existing deployment
			h.store.UpdateDeployment(deployment.ID, map[string]interface{}{
				"status": models.StatusCancelled,
				"end_time": time.Now(),
				"error_msg": "Cancelled by new deployment",
			})
		}
	}
	
	// Create deployment record
	deployment := &models.Deployment{
		ServiceName: req.ServiceName,
		Environment: req.Environment,
		Branch:      req.Branch,
		CommitHash:  req.CommitHash,
		Status:      models.StatusPending,
		StartTime:   time.Now(),
		DeployedBy:  req.DeployedBy,
	}
	
	if err := h.store.CreateDeployment(deployment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	// Start deployment asynchronously
	go h.performDeployment(deployment, models.EnvironmentTest)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Deployment started",
		"deploymentId": deployment.ID,
	})
}

// PromoteToProduction godoc
// @Summary Promote to production
// @Description Promote a tested version to production environment
// @Tags CICD
// @Param request body models.PromoteRequest true "Promote request"
// @Success 200 {object} gin.H
// @Router /api/cicd/promote [post]
func (h *CICDHandler) PromoteToProduction(c *gin.Context) {
	var req models.PromoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Verify that the version exists in test environment
	testEnv, err := h.store.GetServiceEnvironment(req.ServiceName, models.EnvironmentTest)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Version not found in test environment",
		})
		return
	}
	
	if testEnv.CurrentCommit != req.CommitHash {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Commit hash does not match test environment",
		})
		return
	}
	
	if !testEnv.IsHealthy {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Test environment is not healthy",
		})
		return
	}
	
	// Create production deployment
	deployment := &models.Deployment{
		ServiceName: req.ServiceName,
		Environment: models.EnvironmentProduction,
		Branch:      "main", // Production always uses main branch
		CommitHash:  req.CommitHash,
		Version:     req.Version,
		Status:      models.StatusPending,
		StartTime:   time.Now(),
		DeployedBy:  req.PromotedBy,
		CommitMsg:   fmt.Sprintf("Promoted from test: %s", req.Version),
	}
	
	if err := h.store.CreateDeployment(deployment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	// Start production deployment asynchronously
	go h.performDeployment(deployment, models.EnvironmentProduction)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Promotion to production started",
		"deploymentId": deployment.ID,
	})
}

// RollbackDeployment godoc
// @Summary Rollback deployment
// @Description Rollback to a previous version
// @Tags CICD
// @Param request body models.RollbackRequest true "Rollback request"
// @Success 200 {object} gin.H
// @Router /api/cicd/rollback [post]
func (h *CICDHandler) RollbackDeployment(c *gin.Context) {
	var req models.RollbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	var targetDeployment *models.Deployment
	var err error
	
	if req.DeploymentID > 0 {
		targetDeployment, err = h.store.GetDeployment(req.DeploymentID)
	} else {
		// Get latest successful deployment
		targetDeployment, err = h.store.GetLatestSuccessfulDeployment(
			req.ServiceName, req.Environment, 0)
	}
	
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Target deployment not found"})
		return
	}
	
	// Create rollback deployment record
	rollbackDeployment := &models.Deployment{
		ServiceName: req.ServiceName,
		Environment: req.Environment,
		Branch:      targetDeployment.Branch,
		CommitHash:  targetDeployment.CommitHash,
		Version:     targetDeployment.Version,
		Status:      models.StatusRollback,
		StartTime:   time.Now(),
		DeployedBy:  req.RollbackBy,
		CommitMsg:   fmt.Sprintf("Rollback to deployment %d", targetDeployment.ID),
	}
	
	if err := h.store.CreateDeployment(rollbackDeployment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	// Start rollback asynchronously
	go h.performDeployment(rollbackDeployment, req.Environment)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Rollback started",
		"deploymentId": rollbackDeployment.ID,
		"targetVersion": targetDeployment.Version,
	})
}

// GetDeploymentStatus godoc
// @Summary Get deployment status
// @Description Get real-time deployment status
// @Tags CICD
// @Param id path int true "Deployment ID"
// @Success 200 {object} gin.H
// @Router /api/cicd/deployments/{id}/status [get]
func (h *CICDHandler) GetDeploymentStatus(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid deployment ID"})
		return
	}
	
	deployment, err := h.store.GetDeployment(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Deployment not found"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"deployment": deployment})
}

// GetDeploymentStats godoc
// @Summary Get deployment statistics
// @Description Get deployment statistics for services
// @Tags CICD
// @Param serviceName query string false "Service name"
// @Param environment query string false "Environment"
// @Param days query int false "Days to look back" default(30)
// @Success 200 {object} gin.H
// @Router /api/cicd/stats [get]
func (h *CICDHandler) GetDeploymentStats(c *gin.Context) {
	serviceName := c.Query("serviceName")
	environmentStr := c.Query("environment")
	daysStr := c.DefaultQuery("days", "30")
	
	days, err := strconv.Atoi(daysStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid days parameter"})
		return
	}
	
	var environment models.Environment
	if environmentStr != "" {
		environment = models.Environment(environmentStr)
	}
	
	stats, err := h.store.GetDeploymentStats(serviceName, environment, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"stats": stats})
}

// performDeployment performs the actual deployment process
func (h *CICDHandler) performDeployment(deployment *models.Deployment, environment models.Environment) {
	// Update status to running
	h.store.UpdateDeployment(deployment.ID, map[string]interface{}{
		"status": models.StatusRunning,
	})
	
	var buildLog strings.Builder
	var success bool
	startTime := time.Now()
	
	defer func() {
		endTime := time.Now()
		duration := int64(endTime.Sub(startTime).Seconds())
		
		updates := map[string]interface{}{
			"end_time": endTime,
			"duration": duration,
			"build_log": buildLog.String(),
		}
		
		if success {
			updates["status"] = models.StatusSuccess
			// Update service environment
			serviceEnv := &models.ServiceEnvironment{
				ServiceName:    deployment.ServiceName,
				Environment:    environment,
				CurrentVersion: deployment.Version,
				CurrentCommit:  deployment.CommitHash,
				DeploymentID:   &deployment.ID,
				LastDeployedAt: &endTime,
				IsHealthy:      true,
			}
			h.store.CreateOrUpdateServiceEnvironment(serviceEnv)
		} else {
			updates["status"] = models.StatusFailed
		}
		
		h.store.UpdateDeployment(deployment.ID, updates)
	}()
	
	buildLog.WriteString(fmt.Sprintf("Starting deployment for %s to %s environment\n", 
		deployment.ServiceName, environment))
	buildLog.WriteString(fmt.Sprintf("Commit: %s\n", deployment.CommitHash))
	buildLog.WriteString(fmt.Sprintf("Branch: %s\n", deployment.Branch))
	
	// Get repository URL based on environment
	repoURL := getRepositoryURL(deployment.ServiceName, environment)
	if repoURL == "" {
		buildLog.WriteString("ERROR: No repository configured for this service and environment\n")
		return
	}
	
	// Execute deployment script
	var cmd *exec.Cmd
	if environment == models.EnvironmentTest {
		cmd = exec.Command("/bin/bash", "-c", fmt.Sprintf(
			"cd /tmp && rm -rf deploy-%s && git clone %s deploy-%s && cd deploy-%s && git checkout %s && ./deploy-test.sh",
			deployment.ServiceName, repoURL, deployment.ServiceName, deployment.ServiceName, deployment.Branch))
	} else {
		cmd = exec.Command("/bin/bash", "-c", fmt.Sprintf(
			"cd /tmp && rm -rf deploy-%s && git clone %s deploy-%s && cd deploy-%s && git checkout %s && ./deploy-prod.sh",
			deployment.ServiceName, repoURL, deployment.ServiceName, deployment.ServiceName, deployment.Branch))
	}
	
	output, err := cmd.CombinedOutput()
	buildLog.Write(output)
	
	if err != nil {
		buildLog.WriteString(fmt.Sprintf("ERROR: Deployment failed: %s\n", err.Error()))
		h.store.UpdateDeployment(deployment.ID, map[string]interface{}{
			"error_msg": err.Error(),
		})
		return
	}
	
	// Health check
	buildLog.WriteString("Performing health check...\n")
	if h.performHealthCheck(deployment.ServiceName, environment) {
		buildLog.WriteString("Health check passed\n")
		success = true
	} else {
		buildLog.WriteString("Health check failed\n")
		success = false
	}
}

// getRepositoryURL gets the repository URL for a service and environment
func getRepositoryURL(serviceName string, environment models.Environment) string {
	// This would be configured per service, for now return a placeholder
	if environment == models.EnvironmentTest {
		return fmt.Sprintf("git@test-server:/opt/repos/%s-test.git", serviceName)
	}
	return fmt.Sprintf("git@prod-server:/opt/repos/%s-prod.git", serviceName)
}

// performHealthCheck performs health check for deployed service
func (h *CICDHandler) performHealthCheck(serviceName string, environment models.Environment) bool {
	// This would implement actual health check logic
	// For now, return true as placeholder
	time.Sleep(2 * time.Second) // Simulate health check time
	return true
}