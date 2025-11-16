package api

import (
	"control/go_server/db"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DeviceVersion represents the version information for a single device.
type DeviceVersion struct {
	DevCode                string `json:"dev_code"`
	DeviceType             int    `json:"device_type"`
	MerchantID             int64  `json:"merchant_id"`
	PersonalAppVersion     string `json:"personal_app_version"`
	IsPersonalAppLatest    bool   `json:"is_personal_app_latest"`
	BusinessAppVersion     string `json:"business_app_version"`
	IsBusinessAppLatest    bool   `json:"is_business_app_latest"`
	PersonalPluginVersion  string `json:"personal_plugin_version"`
	IsPersonalPluginLatest bool   `json:"is_personal_plugin_latest"`
	BusinessPluginVersion  string `json:"business_plugin_version"`
	IsBusinessPluginLatest bool   `json:"is_business_plugin_latest"`
}

// Version holds the latest version information.
type Version struct {
	WhatsappPerson         string `gorm:"column:whatsapp_person"`
	WhatsappBusiness       string `gorm:"column:whatsapp_business"`
	WhatsappPersonPlugin   string `gorm:"column:whatsapp_person_plugin"`
	WhatsappBusinessPlugin string `gorm:"column:whatsapp_business_plugin"`
}

func (Version) TableName() string {
	return "version"
}

// BatchUpdateRequest represents the request for batch updating app/plugin
type BatchUpdateAppRequest struct {
	DeviceType int   `json:"device_type" binding:"required"`
	MerchantID int64 `json:"merchant_id" binding:"required"`
	IDs        []int `json:"ids" binding:"required"`
}

type BatchUpdatePluginRequest struct {
	DeviceType int   `json:"device_type" binding:"required"`
	MerchantID int64 `json:"merchant_id" binding:"required"`
	IDs        []int `json:"ids" binding:"required"`
	PlatformID int   `json:"platform_id" binding:"required"`
}

type BatchUpdateResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// BatchUpdateAppExternalHandler handles batch app update requests
func BatchUpdateAppExternalHandler(c *gin.Context) {
	var req BatchUpdateAppRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: fmt.Sprintf("Invalid request format: %v", err),
			Data:    nil,
		})
		return
	}

	// Validate merchant_id
	if req.MerchantID <= 0 {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: "merchant_id must be greater than 0",
			Data:    nil,
		})
		return
	}

	// Validate device_type
	if req.DeviceType != 1 && req.DeviceType != 2 {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: "device_type must be 1 (box) or 2 (cloud)",
			Data:    nil,
		})
		return
	}

	// Validate IDs
	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: "ids cannot be empty",
			Data:    nil,
		})
		return
	}

	// Log the request
	reqJSON, _ := json.Marshal(req)
	fmt.Printf("Batch update app request: %s\n", reqJSON)

	// Here you would implement the actual batch update logic
	// For now, we'll simulate a successful response
	c.JSON(http.StatusOK, BatchUpdateResponse{
		Code:    200,
		Message: "Batch app update request submitted successfully",
		Data:    nil,
	})
}

// BatchUpdatePluginExternalHandler handles batch plugin update requests
func BatchUpdatePluginExternalHandler(c *gin.Context) {
	var req BatchUpdatePluginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: fmt.Sprintf("Invalid request format: %v", err),
			Data:    nil,
		})
		return
	}

	// Validate merchant_id
	if req.MerchantID <= 0 {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: "merchant_id must be greater than 0",
			Data:    nil,
		})
		return
	}

	// Validate device_type
	if req.DeviceType != 1 && req.DeviceType != 2 {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: "device_type must be 1 (box) or 2 (cloud)",
			Data:    nil,
		})
		return
	}

	// Validate platform_id
	if req.PlatformID != 1 && req.PlatformID != 2 {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: "platform_id must be 1 (whatsapp) or 2 (telegram)",
			Data:    nil,
		})
		return
	}

	// Validate IDs
	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, BatchUpdateResponse{
			Code:    400,
			Message: "ids cannot be empty",
			Data:    nil,
		})
		return
	}

	// Log the request
	reqJSON, _ := json.Marshal(req)
	fmt.Printf("Batch update plugin request: %s\n", reqJSON)

	// Here you would implement the actual batch update logic
	// For now, we'll simulate a successful response
	c.JSON(http.StatusOK, BatchUpdateResponse{
		Code:    200,
		Message: "Batch plugin update request submitted successfully",
		Data:    nil,
	})
}

// GetDeviceAppVersionsHandler retrieves and filters device application and plugin versions.
func GetDeviceAppVersionsHandler(c *gin.Context) {
	// --- 1. Get Latest Versions ---
	var latestVersions Version
	if err := db.G.First(&latestVersions).Error; err != nil {
		if err != gorm.ErrRecordNotFound {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch latest versions"})
			return
		}
		// If record is not found, latestVersions will be zeroed, which is fine.
	}

	// --- 2. Get Query Parameters ---
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	offset := (page - 1) * pageSize

	// Combined search for dev_code or merchant_id
	searchQuery := c.Query("search_query")
	deviceType, _ := strconv.Atoi(c.Query("device_type"))
	versionStatus := c.Query("version_status") // "all", "app_outdated", "plugin_outdated"
	appVersion := c.Query("app_version")
	pluginVersion := c.Query("plugin_version")

	// --- 3. Build Union Query for Devices ---
	// Create a CTE (Common Table Expression) for all devices
	deviceQuery := db.G.Raw(`
        SELECT dev_code, merchant_id, 1 AS device_type FROM ai_box_device WHERE deleted_at IS NULL
        UNION ALL
        SELECT dev_code, merchant_id, 2 AS device_type FROM cloud_device WHERE deleted_at IS NULL
    `)

	// --- 4. Build Main Query ---
	query := db.G.Table("(?) as devices", deviceQuery).
		Select(`
            devices.dev_code,
            devices.merchant_id,
            devices.device_type,
            MAX(CASE WHEN dav.type = 1 THEN dav.version ELSE '' END) as personal_app_version,
            MAX(CASE WHEN dav.type = 2 THEN dav.version ELSE '' END) as business_app_version,
            MAX(CASE WHEN dav.type = 3 THEN dav.version ELSE '' END) as personal_plugin_version,
            MAX(CASE WHEN dav.type = 4 THEN dav.version ELSE '' END) as business_plugin_version
        `).
		Joins("LEFT JOIN device_app_version dav ON devices.dev_code = dav.dev_code").
		Group("devices.dev_code, devices.merchant_id, devices.device_type")

	// --- 5. Apply Filters ---
	if searchQuery != "" {
		// Check if searchQuery is likely a merchant_id (numeric)
		if _, err := strconv.Atoi(searchQuery); err == nil {
			query = query.Where("devices.merchant_id = ?", searchQuery)
		} else {
			query = query.Where("devices.dev_code LIKE ?", "%"+searchQuery+"%")
		}
	}

	if deviceType != 0 {
		query = query.Where("devices.device_type = ?", deviceType)
	}

	// --- Apply HAVING clauses for version-based filters ---
	var havingConditions []string
	var havingArgs []interface{}

	if appVersion != "" {
		havingConditions = append(havingConditions, "(personal_app_version LIKE ? OR business_app_version LIKE ?)")
		havingArgs = append(havingArgs, "%"+appVersion+"%", "%"+appVersion+"%")
	}
	if pluginVersion != "" {
		havingConditions = append(havingConditions, "(personal_plugin_version LIKE ? OR business_plugin_version LIKE ?)")
		havingArgs = append(havingArgs, "%"+pluginVersion+"%", "%"+pluginVersion+"%")
	}

	switch versionStatus {
	case "app_outdated":
		havingConditions = append(havingConditions, "(personal_app_version != ? OR business_app_version != ?)")
		havingArgs = append(havingArgs, latestVersions.WhatsappPerson, latestVersions.WhatsappBusiness)
	case "plugin_outdated":
		havingConditions = append(havingConditions, "(personal_plugin_version != ? OR business_plugin_version != ?)")
		havingArgs = append(havingArgs, latestVersions.WhatsappPersonPlugin, latestVersions.WhatsappBusinessPlugin)
	case "all_outdated":
		havingConditions = append(havingConditions, "(personal_app_version != ? OR business_app_version != ? OR personal_plugin_version != ? OR business_plugin_version != ?)")
		havingArgs = append(havingArgs, latestVersions.WhatsappPerson, latestVersions.WhatsappBusiness, latestVersions.WhatsappPersonPlugin, latestVersions.WhatsappBusinessPlugin)
	case "all_updated":
		havingConditions = append(havingConditions, "(personal_app_version = ? AND business_app_version = ? AND personal_plugin_version = ? AND business_plugin_version = ?)")
		havingArgs = append(havingArgs, latestVersions.WhatsappPerson, latestVersions.WhatsappBusiness, latestVersions.WhatsappPersonPlugin, latestVersions.WhatsappBusinessPlugin)
	}

	if len(havingConditions) > 0 {
		query = query.Having(strings.Join(havingConditions, " AND "), havingArgs...)
	}

	// --- 6. Get Total Count & Paginated Data ---
	var total int64
	// To get the total count, we need to wrap the query
	countQuery := db.G.Table("(?) as sub", query)
	if err := countQuery.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to count device versions"})
		return
	}

	var results []DeviceVersion
	if err := query.Limit(pageSize).Offset(offset).Scan(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch device versions"})
		return
	}

	// --- 7. Compare with Latest Versions ---
	for i := range results {
		results[i].IsPersonalAppLatest = results[i].PersonalAppVersion == latestVersions.WhatsappPerson
		results[i].IsBusinessAppLatest = results[i].BusinessAppVersion == latestVersions.WhatsappBusiness
		results[i].IsPersonalPluginLatest = results[i].PersonalPluginVersion == latestVersions.WhatsappPersonPlugin
		results[i].IsBusinessPluginLatest = results[i].BusinessPluginVersion == latestVersions.WhatsappBusinessPlugin
	}

	// --- 8. Return Response ---
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"data":      results,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}
