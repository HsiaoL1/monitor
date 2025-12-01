package api

import (
	"control/go_server/db"
	"control/go_server/internal/models"
	"control/go_server/internal/utils"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const browserServerRedisPrefix = "browser_server:"

// BrowserServerStats extends BrowserServer with online count
type BrowserServerStats struct {
	models.BrowserServer
	OnlineAccountCount int64 `json:"online_account_count"`
}

// BrowserAccountInfo defines the detailed information for a social account on a browser server.
type BrowserAccountInfo struct {
	ID              int64     `gorm:"column:id" json:"id"`
	Account         string    `gorm:"column:account" json:"account"`
	MerchantID      int64     `gorm:"column:merchant_id" json:"merchant_id"`
	AccountType     int       `gorm:"column:account_type" json:"account_type"`
	AccountStatus   int8      `gorm:"column:account_status" json:"account_status"`
	WebOnlineStatus int8      `gorm:"column:web_online_status" json:"web_online_status"`
	WebHeartTime    time.Time `gorm:"column:web_heart_time" json:"web_heart_time"`
	WebClientNo     string    `gorm:"column:web_client_no" json:"web_client_no"`
	CountryCode     string    `gorm:"column:country_code" json:"country_code"`
	DevCode         string    `gorm:"column:dev_code" json:"dev_code"`
	DeviceType      int       `gorm:"column:device_type" json:"device_type"`
}

func (BrowserAccountInfo) TableName() string {
	return "social_accounts"
}

// GetBrowserServersHandler retrieves all browser servers
func GetBrowserServersHandler(c *gin.Context) {
	var servers []models.BrowserServer
	if err := db.G.Order("name asc").Find(&servers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch servers"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": servers})
}

// CreateBrowserServerHandler creates a new browser server
func CreateBrowserServerHandler(c *gin.Context) {
	var req models.BrowserServer
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Server name is required"})
		return
	}
	if strings.Contains(req.Name, ":") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Server name cannot contain the character ':'"})
		return
	}

	server := models.BrowserServer{
		Name:            req.Name,
		MaxBrowserCount: req.MaxBrowserCount,
		IsEnabled:       req.IsEnabled,
	}
	if err := db.G.Create(&server).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create server, maybe name already exists?"})
		return
	}

	// Also create the corresponding set in Redis
	rdb, err := utils.ConnectRedis()
	if err != nil {
		log.Printf("Warning: Server '%s' created in DB, but failed to connect to Redis to create set: %v", server.Name, err)
		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"data":    server,
			"warning": "Server created, but failed to initialize corresponding Redis set.",
		})
		return
	}

	redisKey := fmt.Sprintf("%s%s", browserServerRedisPrefix, server.Name)
	// Use SAdd with a dummy value and then SRem to ensure the key exists as an empty set.
	if err := rdb.SAdd(c, redisKey, "__init__").Err(); err != nil {
		log.Printf("Warning: failed to add placeholder to set %s: %v", redisKey, err)
	} else {
		if err := rdb.SRem(c, redisKey, "__init__").Err(); err != nil {
			log.Printf("Warning: failed to remove placeholder from set %s: %v", redisKey, err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": server})
}

// UpdateBrowserServerHandler updates an existing browser server
func UpdateBrowserServerHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid server ID"})
		return
	}
	var req models.BrowserServer
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}
	if strings.Contains(req.Name, ":") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Server name cannot contain the character ':'"})
		return
	}

	// Get the current server name before updating
	var currentServer models.BrowserServer
	if err := db.G.First(&currentServer, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Server not found"})
		return
	}
	oldName := currentServer.Name

	// Update DB
	updates := map[string]any{
		"name":              req.Name,
		"max_browser_count": req.MaxBrowserCount,
		"is_enabled":        req.IsEnabled,
	}
	if err := db.G.Model(&models.BrowserServer{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update server"})
		return
	}

	// If name has changed, rename the redis key
	newName := req.Name
	if oldName != newName && newName != "" {
		rdb, err := utils.ConnectRedis()
		if err != nil {
			log.Printf("Warning: Server name updated in DB, but failed to connect to Redis to rename set: %v", err)
			c.JSON(http.StatusOK, gin.H{"success": true, "warning": "Server updated, but Redis key rename failed."})
			return
		}

		oldKey := fmt.Sprintf("%s%s", browserServerRedisPrefix, oldName)
		newKey := fmt.Sprintf("%s%s", browserServerRedisPrefix, newName)

		exists, err := rdb.Exists(c, oldKey).Result()
		if err != nil {
			log.Printf("Warning: Failed to check existence of old Redis key %s: %v", oldKey, err)
		}

		if exists > 0 {
			if err := rdb.Rename(c, oldKey, newKey).Err(); err != nil {
				log.Printf("Error: Failed to rename Redis key from %s to %s: %v", oldKey, newKey, err)
				c.JSON(http.StatusOK, gin.H{"success": true, "warning": fmt.Sprintf("DB updated, but failed to rename Redis key from %s to %s", oldName, newName)})
				return
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DeleteBrowserServerHandler deletes a browser server
func DeleteBrowserServerHandler(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid server ID"})
		return
	}

	// First, find the server to get its name for Redis cleanup
	var server models.BrowserServer
	if err := db.G.First(&server, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Server not found"})
		return
	}

	// Delete from DB
	if err := db.G.Delete(&models.BrowserServer{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete server from database"})
		return
	}

	// Delete Redis set
	rdb, err := utils.ConnectRedis()
	if err != nil {
		log.Printf("Warning: failed to connect to Redis to clean up set for server %s: %v", server.Name, err)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Server deleted from DB, but failed to connect to Redis for cleanup."})
		return
	}
	redisKey := fmt.Sprintf("%s%s", browserServerRedisPrefix, server.Name)
	if err := rdb.Del(c, redisKey).Err(); err != nil {
		log.Printf("Warning: failed to delete Redis set %s: %v", redisKey, err)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Server deleted from DB, but failed to clean up Redis set."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// BatchUpdateBrowserServerStatusHandler updates the is_enabled status for multiple servers
func BatchUpdateBrowserServerStatusHandler(c *gin.Context) {
	var req struct {
		IDs       []int64 `json:"ids" binding:"required"`
		IsEnabled bool    `json:"is_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}

	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No server IDs provided"})
		return
	}

	if err := db.G.Model(&models.BrowserServer{}).
		Where("id IN ?", req.IDs).
		Update("is_enabled", req.IsEnabled).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update servers"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": fmt.Sprintf("Successfully updated %d server(s)", len(req.IDs))})
}

// GetBrowserServerStatsHandler retrieves all servers with their online account counts from the database.
func GetBrowserServerStatsHandler(c *gin.Context) {
	var servers []models.BrowserServer
	if err := db.G.Order("id desc").Find(&servers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch servers"})
		return
	}

	type accountStat struct {
		WebClientNo string
		Count       int64
	}

	var stats []accountStat
	if err := db.G.Model(&BrowserAccountInfo{}).
		Select("web_client_no, count(*) as count").
		Where("web_online_status = 1").
		Group("web_client_no").
		Scan(&stats).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to calculate stats"})
		return
	}

	statsMap := make(map[string]int64)
	for _, stat := range stats {
		statsMap[stat.WebClientNo] = stat.Count
	}

	var result []BrowserServerStats
	for _, server := range servers {
		result = append(result, BrowserServerStats{
			BrowserServer:      server,
			OnlineAccountCount: statsMap[server.Name], // Defaults to 0 if not in map
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

// GetBrowserAccountsHandler retrieves a paginated and filtered list of social accounts for browser servers.
func GetBrowserAccountsHandler(c *gin.Context) {
	// Filtering parameters
	webClientNo := c.Query("web_client_no")
	webOnlineStatus := c.Query("web_online_status")
	merchantID := c.Query("merchant_id")
	devCode := c.Query("dev_code")

	// Pagination parameters
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	offset := (page - 1) * pageSize

	query := db.G.Model(&BrowserAccountInfo{})

	// Apply filters
	if webClientNo != "" {
		query = query.Where("web_client_no = ?", webClientNo)
	} else {
		query = query.Where("web_client_no != ''")
	}
	if webOnlineStatus != "" {
		query = query.Where("web_online_status = ?", webOnlineStatus)
	}
	if merchantID != "" {
		query = query.Where("merchant_id = ?", merchantID)
	}
	if devCode != "" {
		query = query.Where("dev_code LIKE ?", "%"+devCode+"%")
	}

	// Get total count for pagination
	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to count accounts"})
		return
	}

	// Get paginated data
	var accounts []BrowserAccountInfo
	if err := query.Offset(offset).Limit(pageSize).Order("id desc").Find(&accounts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch accounts"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"data":      accounts,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// --- Batch Relogin Feature ---

const WebTaskQueuePrefix = "web_task_queue:"

// WebTask represents the structure of a task in the queue
type WebTask struct {
	ID          int64  `json:"id"`
	Type        string `json:"type"`
	PhoneNumber string `json:"phone_number"`
	Timezone    string `json:"timezone"`
	Language    string `json:"language"`
	Proxy       string `json:"proxy"`
}

// ReloginRequest defines the request body for relogin
type ReloginRequest struct {
	AccountIDs []int64 `json:"account_ids"`
}

type Proxy struct {
	ID       int    `gorm:"column:id"`
	Ip       string `gorm:"column:ip"`
	Port     string `gorm:"column:port"`
	Account  string `gorm:"column:account"`
	Password string `gorm:"column:password"`
}

func (Proxy) TableName() string { return "proxy" }

// ReloginBrowserAccountsHandler handles the batch relogin request
func ReloginBrowserAccountsHandler(c *gin.Context) {
	var req ReloginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request body"})
		return
	}

	if len(req.AccountIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "account_ids are required"})
		return
	}

	var accounts []models.SocialAccount
	if err := db.G.Where("id IN ?", req.AccountIDs).Find(&accounts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch accounts"})
		return
	}

	var queuedCount int
	var errors []string

	for _, acc := range accounts {
		if acc.WebClientNo == "" {
			errMsg := fmt.Sprintf("Account %s (ID: %d) has no assigned server (web_client_no is empty)", acc.Account, acc.ID)
			errors = append(errors, errMsg)
			log.Println(errMsg)
			continue
		}
		if err := queueLoginTask(c, acc); err != nil {
			errMsg := fmt.Sprintf("Failed to queue login task for account %s (ID: %d): %v", acc.Account, acc.ID, err)
			errors = append(errors, errMsg)
			log.Println(errMsg)
		} else {
			queuedCount++
		}
	}

	if len(errors) > 0 {
		c.JSON(http.StatusMultiStatus, gin.H{
			"success":      false,
			"message":      fmt.Sprintf("Completed with %d errors", len(errors)),
			"queued_count": queuedCount,
			"errors":       errors,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"message":      fmt.Sprintf("Successfully queued %d accounts for relogin", queuedCount),
		"queued_count": queuedCount,
	})
}

func queueLoginTask(c *gin.Context, acc models.SocialAccount) error {
	proxyString, err := getProxyStringForAccount(acc.DeviceType, acc.DevCode)
	if err != nil {
		log.Printf("Warning: Failed to get proxy for account %s: %v", acc.Account, err)
		// Not returning error, as proxy might be optional
	}

	// Default values
	timezone := "Asia/Shanghai"
	language := "zh-CN"

	if acc.ExtraInfo != "" {
		var extraInfo struct {
			Timezone string `json:"timezone"`
			Language string `json:"language"`
		}
		if err := json.Unmarshal([]byte(acc.ExtraInfo), &extraInfo); err == nil {
			if extraInfo.Timezone != "" {
				timezone = extraInfo.Timezone
			}
			if extraInfo.Language != "" {
				language = extraInfo.Language
			}
		} else {
			log.Printf("Warning: Failed to unmarshal extra_info for account %s: %v", acc.Account, err)
		}
	}

	task := WebTask{
		ID:          acc.ID,
		Type:        "pairing_code", // Assuming this is the correct type for web relogin
		PhoneNumber: acc.Account,
		Timezone:    timezone,
		Language:    language,
		Proxy:       proxyString,
	}

	taskJSON, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("failed to marshal task for account %s: %v", acc.Account, err)
	}

	queueName := WebTaskQueuePrefix + acc.WebClientNo
	rdb, err := utils.ConnectRedis()
	if err != nil {
		return fmt.Errorf("failed to connect to redis: %v", err)
	}

	if err := rdb.RPush(c, queueName, taskJSON).Err(); err != nil {
		return fmt.Errorf("failed to push task to redis queue '%s' for account %s: %v", queueName, acc.Account, err)
	}

	log.Printf("Successfully pushed web login task for account %s to queue %s", acc.Account, queueName)
	return nil
}

func getProxyStringForAccount(deviceType int, devCode string) (string, error) {
	if devCode == "" {
		return "", nil // No device code, no proxy
	}

	var proxyID int
	var err error

	switch deviceType {
	case 1: // ai_box_device
		var aiBoxDevice AiBoxDevice
		err = db.G.Where("dev_code = ?", devCode).Where("deleted_at is null").First(&aiBoxDevice).Error
		if err != nil {
			return "", fmt.Errorf("failed to find ai_box_device with dev_code %s: %v", devCode, err)
		}
		proxyID = aiBoxDevice.ProxyId
	case 2: // cloud_device
		var cloudDevice CloudDevice
		err = db.G.Where("dev_code = ?", devCode).Where("deleted_at is null").First(&cloudDevice).Error
		if err != nil {
			return "", fmt.Errorf("failed to find cloud_device with dev_code %s: %v", devCode, err)
		}
		proxyID = cloudDevice.ProxyId
	default:
		return "", fmt.Errorf("unsupported device_type: %d", deviceType)
	}

	if proxyID == 0 {
		return "", nil // No proxy associated
	}

	var proxy Proxy
	if err := db.G.First(&proxy, proxyID).Error; err != nil {
		log.Printf("Warning: proxy with id %d not found, though it is referenced by dev_code %s", proxyID, devCode)
		return "", nil
	}

	if proxy.Ip == "" || proxy.Port == "" {
		return "", nil // Proxy record exists but is incomplete
	}

	if proxy.Account != "" && proxy.Password != "" {
		return fmt.Sprintf("%s:%s@%s:%s", proxy.Account, proxy.Password, proxy.Ip, proxy.Port), nil
	}

	return fmt.Sprintf("%s:%s", proxy.Ip, proxy.Port), nil
}
