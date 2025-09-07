package api

import (
	"bytes"
	"context"
	"control/go_server/db"
	"control/go_server/internal/storage"
	"control/go_server/internal/utils"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

const (
	onlineHashKey           = "ims_server_ws:online"
	heartbeatTimeout        = 60 // 60 seconds
	HeartbeatTimeoutSeconds = 60 * time.Second
)

var accountSyncLogStorage *storage.AccountSyncLogStorage

func init() {
	// Initialize account sync log storage
	accountSyncLogStorage = storage.NewAccountSyncLogStorage("./logs/account_sync")
}

type UserOnlineInfo struct {
	ServerIP               string `json:"server"`
	HTTPPort               string `json:"http_port"`
	Online                 bool   `json:"online"`
	LoginTime              int64  `json:"loginTime"`
	LoginTimeFormatted     string `json:"loginTimeFormatted"`
	HeartbeatTime          int64  `json:"heartbeatTime"`
	HeartbeatTimeFormatted string `json:"heartbeatTimeFormatted"`
	BdClientNo             string `json:"bdClientNo"`
	PlatformId             string `json:"platformId"`
	ThirdApp               string `json:"thirdApp"`
}

type SocialAccount struct {
	ID            int64  `gorm:"column:id" json:"id"`
	MerchantID    int64  `gorm:"column:merchant_id" json:"merchant_id"`
	Account       string `gorm:"column:account" json:"account"`
	AppUniqueID   string `gorm:"column:app_unique_id" json:"app_unique_id"`
	AccountStatus int8   `gorm:"column:account_status" json:"account_status"` // 0:禁用,1:启用
	PlatformID    int64  `gorm:"column:platform_id" json:"platform_id"`
	OnlineStatus  int8   `gorm:"column:online_status" json:"online_status"` // 0:离线,1:在线,2上线中，3下线中
}

type AccountStatusMismatch struct {
	SocialAccount SocialAccount  `json:"social_account"`
	RedisInfo     UserOnlineInfo `json:"redis_info"`
	IsHBTimeOut   bool           `json:"is_hb_time_out"`
	RedisExists   bool           `json:"redis_exists"`
	StatusMatch   bool           `json:"status_match"`
}

type RedisClient struct {
	db  *redis.Client
	mu  sync.Mutex
	ctx context.Context
}

func NewRedisClient(db *redis.Client, ctx context.Context) *RedisClient {
	return &RedisClient{
		db:  db,
		ctx: ctx,
	}
}

// GetHashFieldString 从 Hash 中获取指定字段的原始字符串值
func (r *RedisClient) GetHashFieldString(hashKey, field string) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 获取字段值
	value, err := r.db.HGet(r.ctx, hashKey, field).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", fmt.Errorf("字段不存在")
		}
		return "", fmt.Errorf("获取 Hash 字段失败: %w", err)
	}

	return value, nil
}

// GetStaleUsersHandler gets stale users from Redis.
func GetStaleUsersHandler(c *gin.Context) {
	rdb, err := utils.ConnectRedis()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to connect to Redis", "message": err.Error()})
		return
	}

	allUsersData, err := rdb.HGetAll(c, onlineHashKey).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch users from Redis", "message": err.Error()})
		return
	}

	var staleUsers []gin.H
	now := time.Now().Unix()

	for userKey, userDataStr := range allUsersData {
		var userInfo map[string]any
		if err := json.Unmarshal([]byte(userDataStr), &userInfo); err != nil {
			continue // Skip if data is malformed
		}

		online, _ := userInfo["online"].(bool)
		heartbeatTime, _ := userInfo["heartbeatTime"].(float64)

		if online && (now-int64(heartbeatTime) > heartbeatTimeout) {
			staleUsers = append(staleUsers, gin.H{
				"userKey":                userKey,
				"server":                 userInfo["server"],
				"http_port":              userInfo["http_port"],
				"online":                 userInfo["online"],
				"loginTime":              userInfo["loginTime"],
				"loginTimeFormatted":     userInfo["loginTimeFormatted"],
				"heartbeatTime":          userInfo["heartbeatTime"],
				"heartbeatTimeFormatted": userInfo["heartbeatTimeFormatted"],
				"bdClientNo":             userInfo["bdClientNo"],
				"platformId":             userInfo["platformId"],
				"thirdApp":               userInfo["thirdApp"],
				"timeoutSeconds":         now - int64(heartbeatTime),
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"totalUsers": len(allUsersData),
		"staleUsers": staleUsers,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})
}

// CleanupStaleUsersHandler cleans up stale users in Redis.
func CleanupStaleUsersHandler(c *gin.Context) {
	rdb, err := utils.ConnectRedis()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to connect to Redis", "message": err.Error()})
		return
	}

	allUsersData, err := rdb.HGetAll(c, onlineHashKey).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch users from Redis", "message": err.Error()})
		return
	}

	cleanedCount := 0
	now := time.Now().Unix()

	for userKey, userDataStr := range allUsersData {
		var userInfo map[string]any
		if err := json.Unmarshal([]byte(userDataStr), &userInfo); err != nil {
			continue
		}

		online, _ := userInfo["online"].(bool)
		heartbeatTime, _ := userInfo["heartbeatTime"].(float64)

		if online && (now-int64(heartbeatTime) > heartbeatTimeout) {
			userInfo["online"] = false
			updatedData, _ := json.Marshal(userInfo)
			rdb.HSet(c, onlineHashKey, userKey, updatedData)
			cleanedCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"cleanedCount": cleanedCount,
		"totalUsers":   len(allUsersData),
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})
}

// GetAccountMismatchHandler 获取账号状态不匹配的数据
func GetAccountMismatchHandler(c *gin.Context) {
	// 获取所有社媒账号
	var accounts []SocialAccount
	if err := db.G.Table("social_accounts").
		Where("deleted_at IS NULL").
		Select("id, merchant_id, account, app_unique_id, platform_id, online_status, account_status").
		Scan(&accounts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch social accounts",
			"message": err.Error(),
		})
		return
	}

	// 连接Redis
	rdb, err := utils.ConnectRedis()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to connect to Redis",
			"message": err.Error(),
		})
		return
	}

	var mismatches []AccountStatusMismatch

	for _, account := range accounts {
		// 使用app_unique_id作为Redis中的userKey查询在线状态
		userKey := account.AppUniqueID
		redisClient := NewRedisClient(rdb, context.Background())
		redisData, err := redisClient.GetHashFieldString(onlineHashKey, userKey)

		var mismatch AccountStatusMismatch
		mismatch.SocialAccount = account
		mismatch.RedisExists = (err == nil && redisData != "")

		if mismatch.RedisExists {
			// 解析Redis中的用户信息
			var redisInfo UserOnlineInfo
			if err := json.Unmarshal([]byte(redisData), &redisInfo); err != nil {
				mismatch.StatusMatch = false
				mismatch.IsHBTimeOut = false
			} else {
				mismatch.RedisInfo = redisInfo
				// 判断心跳是否超时
				currentTime := time.Now().Unix()
				heartbeatDuration := time.Duration(currentTime-redisInfo.HeartbeatTime) * time.Second
				mismatch.IsHBTimeOut = heartbeatDuration > HeartbeatTimeoutSeconds

				// 比较在线状态
				dbOnline := (account.OnlineStatus == 1) // 只有状态为1才认为是在线
				mismatch.StatusMatch = (dbOnline == redisInfo.Online)
			}
		} else {
			// Redis中不存在该用户，如果数据库中状态为在线则为不匹配
			mismatch.StatusMatch = (account.OnlineStatus != 1)
			mismatch.IsHBTimeOut = false
		}

		// 只返回状态不匹配的记录
		if !mismatch.StatusMatch {
			mismatches = append(mismatches, mismatch)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"totalAccounts": len(accounts),
		"mismatchCount": len(mismatches),
		"mismatches":    mismatches,
		"timestamp":     time.Now().UTC().Format(time.RFC3339),
	})
}

// SyncAccountStatusHandler 同步Redis状态到数据库
func SyncAccountStatusHandler(c *gin.Context) {
	var req struct {
		AppUniqueIDs []string `json:"app_unique_ids"`
		SyncAll      bool     `json:"sync_all"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request parameters"})
		return
	}

	// 连接Redis
	rdb, err := utils.ConnectRedis()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to connect to Redis",
			"message": err.Error(),
		})
		return
	}

	var syncCount int
	var errors []string

	if req.SyncAll {
		// 同步所有不匹配的账号
		// 这里复用获取不匹配账号的逻辑
		// 为了简化，我们重新获取一遍
		var accounts []SocialAccount
		if err := db.G.Table("social_accounts").
			Where("deleted_at IS NULL").
			Select("id, merchant_id, account, app_unique_id, platform_id, online_status, account_status").
			Scan(&accounts).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to fetch social accounts",
			})
			return
		}

		for _, account := range accounts {
			if err := syncSingleAccount(account.AppUniqueID, rdb); err != nil {
				errors = append(errors, fmt.Sprintf("Failed to sync %s: %v", account.AppUniqueID, err))
			} else {
				syncCount++
			}
		}
	} else {
		// 同步指定的账号
		for _, appUniqueID := range req.AppUniqueIDs {
			if err := syncSingleAccount(appUniqueID, rdb); err != nil {
				errors = append(errors, fmt.Sprintf("Failed to sync %s: %v", appUniqueID, err))
			} else {
				syncCount++
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"syncCount": syncCount,
		"errors":    errors,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// syncSingleAccount 同步单个账号的状态
func syncSingleAccount(appUniqueID string, rdb *redis.Client) error {
	// 首先获取账号信息
	var account SocialAccount
	if err := db.G.Table("social_accounts").
		Where("app_unique_id = ? AND deleted_at IS NULL", appUniqueID).
		Select("id, merchant_id, account, app_unique_id, platform_id, online_status, account_status").
		First(&account).Error; err != nil {
		return fmt.Errorf("account not found: %v", err)
	}

	beforeStatus := account.OnlineStatus

	// 从Redis获取在线状态
	redisClient := NewRedisClient(rdb, context.Background())
	redisData, err := redisClient.GetHashFieldString(onlineHashKey, appUniqueID)

	var newOnlineStatus int8
	var reason string
	var shouldUpdateDB bool = false
	var shouldUpdateRedis bool = false
	var redisInfo UserOnlineInfo

	if err == nil && redisData != "" {
		// Redis中有数据，解析并判断
		if err := json.Unmarshal([]byte(redisData), &redisInfo); err == nil {
			// 检查心跳是否超时
			currentTime := time.Now().Unix()
			heartbeatDuration := time.Duration(currentTime-redisInfo.HeartbeatTime) * time.Second
			isHeartbeatTimeout := heartbeatDuration > HeartbeatTimeoutSeconds

			if redisInfo.Online && !isHeartbeatTimeout {
				// Redis显示在线且心跳正常
				newOnlineStatus = 1
				reason = "Redis显示在线且心跳正常，同步数据库为在线"
				shouldUpdateDB = (account.OnlineStatus != 1)
			} else if redisInfo.Online && isHeartbeatTimeout {
				// Redis显示在线但心跳超时，双方都设为离线
				newOnlineStatus = 0
				reason = fmt.Sprintf("Redis显示在线但心跳超时(%.1f分钟)，同步双方为离线", heartbeatDuration.Minutes())
				shouldUpdateDB = (account.OnlineStatus != 0)
				shouldUpdateRedis = true
			} else {
				// Redis显示离线
				newOnlineStatus = 0
				reason = "Redis显示离线，同步数据库为离线"
				shouldUpdateDB = (account.OnlineStatus != 0)
			}
		} else {
			// Redis数据格式错误
			newOnlineStatus = 0
			reason = "Redis数据格式错误，设置为离线"
			shouldUpdateDB = (account.OnlineStatus != 0)
		}
	} else {
		// Redis中没有数据，根据数据库状态判断
		if account.OnlineStatus == 1 {
			// 数据库显示在线但Redis没有数据，设为离线
			newOnlineStatus = 0
			reason = "数据库显示在线但Redis无数据，设置为离线"
			shouldUpdateDB = true
		} else {
			// 数据库本身就是离线，无需同步
			newOnlineStatus = 0
			reason = "数据库和Redis都显示离线，无需同步"
			shouldUpdateDB = false
		}
	}

	var syncSuccess = true
	var errorMessage = ""

	// 更新数据库状态（如果需要）
	if shouldUpdateDB {
		result := db.G.Table("social_accounts").
			Where("app_unique_id = ? AND deleted_at IS NULL", appUniqueID).
			Update("online_status", newOnlineStatus)

		if result.Error != nil {
			syncSuccess = false
			errorMessage = result.Error.Error()
		} else if result.RowsAffected == 0 {
			syncSuccess = false
			errorMessage = "No rows affected - account may not exist or was already updated"
		}
	}

	// 更新Redis状态（如果需要且数据库更新成功）
	if shouldUpdateRedis && syncSuccess {
		if redisData != "" {
			// 更新现有Redis数据的online字段
			redisInfo.Online = false
			updatedRedisData, err := json.Marshal(redisInfo)
			if err == nil {
				err = rdb.HSet(context.Background(), onlineHashKey, appUniqueID, updatedRedisData).Err()
				if err != nil {
					// Redis更新失败，但数据库已更新，记录警告
					reason += " (Redis更新失败: " + err.Error() + ")"
				} else {
					reason += " (已同步更新Redis)"
				}
			}
		}
	}

	// 记录同步日志
	accountSyncLogStorage.LogAccountSync(
		storage.AccountInfo{
			ID:          int(account.ID),
			Account:     account.Account,
			AppUniqueID: account.AppUniqueID,
			MerchantID:  int(account.MerchantID),
			PlatformID:  int(account.PlatformID),
		},
		"single",
		syncSuccess,
		1,
		reason,
		errorMessage,
		"system",
		"auto",
		int(beforeStatus),
		int(newOnlineStatus),
	)

	if !syncSuccess {
		return fmt.Errorf("sync failed: %s", errorMessage)
	}

	return nil
}

// GetAccountSyncLogHandler 获取账号同步日志
func GetAccountSyncLogHandler(c *gin.Context) {
	startDateStr := c.Query("startDate")
	endDateStr := c.Query("endDate")

	// 设置默认时间范围（最近7天）
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -7)

	// 解析自定义时间范围
	if startDateStr != "" {
		if parsedStart, err := time.Parse(time.RFC3339, startDateStr); err == nil {
			startDate = parsedStart
		}
	}
	if endDateStr != "" {
		if parsedEnd, err := time.Parse(time.RFC3339, endDateStr); err == nil {
			endDate = parsedEnd
		}
	}

	// 获取日志记录
	logs, err := accountSyncLogStorage.GetAccountSyncLogs(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch account sync logs",
			"message": err.Error(),
		})
		return
	}

	// 获取统计信息
	stats, err := accountSyncLogStorage.GetLogStats(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch log statistics",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"logs":       logs,
		"statistics": stats,
		"timeRange": gin.H{
			"start": startDate.Format(time.RFC3339),
			"end":   endDate.Format(time.RFC3339),
		},
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// DownloadAccountSyncLogHandler 下载账号同步日志
func DownloadAccountSyncLogHandler(c *gin.Context) {
	startDateStr := c.Query("startDate")
	endDateStr := c.Query("endDate")

	// 设置默认时间范围（最近30天）
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -30)

	// 解析自定义时间范围
	if startDateStr != "" {
		if parsedStart, err := time.Parse(time.RFC3339, startDateStr); err == nil {
			startDate = parsedStart
		}
	}
	if endDateStr != "" {
		if parsedEnd, err := time.Parse(time.RFC3339, endDateStr); err == nil {
			endDate = parsedEnd
		}
	}

	// 导出日志
	data, err := accountSyncLogStorage.ExportLogs(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to export account sync logs",
			"message": err.Error(),
		})
		return
	}

	filename := fmt.Sprintf("account_sync_log_%s_to_%s.json",
		startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Type", "application/json")
	c.Header("Content-Length", strconv.Itoa(len(data)))

	c.Data(http.StatusOK, "application/json", data)
}

// Proxy monitoring structures
type ProxyInfo struct {
	ID          int64  `gorm:"column:id" json:"id"`
	IP          string `gorm:"column:ip" json:"ip"`
	Port        string `gorm:"column:port" json:"port"`
	CountryCode string `gorm:"column:country_code" json:"country_code"`
	Account     string `gorm:"column:account" json:"account"`
	Password    string `gorm:"column:password" json:"password"`
	Protocol    string `gorm:"column:protocol" json:"protocol"`
	ProxyType   string `gorm:"column:proxy_type" json:"proxy_type"`
	Status      int8   `gorm:"column:status" json:"status"`
	MerchantID  int64  `gorm:"column:merchant_id" json:"merchant_id"`
	CustomCode  int64  `gorm:"column:custom_code" json:"custom_code"`
	ProxyText   string `gorm:"column:proxy_text" json:"proxy_text"`
}

type DeviceInfo struct {
	ID         int64  `json:"id"`
	DevCode    string `json:"dev_code"`
	DevText    string `json:"dev_text"`
	DeviceType string `json:"device_type"` // "ai_box" or "cloud"
	IsOnline   int8   `json:"is_online"`
	MerchantID int64  `json:"merchant_id"`
}

type ProxyStatus struct {
	ProxyInfo    ProxyInfo    `json:"proxy_info"`
	IsAvailable  bool         `json:"is_available"`
	ResponseTime int64        `json:"response_time"` // milliseconds
	ErrorMessage string       `json:"error_message"`
	TestURL      string       `json:"test_url"`
	UsingDevices []DeviceInfo `json:"using_devices"`
	DeviceCount  int          `json:"device_count"`
	CheckTime    time.Time    `json:"check_time"`
}

// 全局变量用于缓存检测结果
var (
	proxyStatusCache   = make(map[int64]ProxyStatus)
	cacheTimestamp     = time.Time{}
	cacheMutex         sync.RWMutex
	cacheValidDuration = 5 * time.Minute // 缓存有效期5分钟
)

// GetProxyStatusHandler 获取代理状态监控信息
func GetProxyStatusHandler(c *gin.Context) {
	// 检查是否需要异步检测
	forceRefresh := c.Query("refresh") == "true"
	useCache := c.Query("use_cache") != "false"           // 默认使用缓存
	allowDirectCheck := c.Query("allow_direct") == "true" // 是否允许直接检测

	cacheMutex.RLock()
	cacheValid := time.Since(cacheTimestamp) < cacheValidDuration && len(proxyStatusCache) > 0
	cacheExists := len(proxyStatusCache) > 0
	cacheMutex.RUnlock()

	// 如果缓存有效且不强制刷新，直接返回缓存结果
	if useCache && cacheValid && !forceRefresh {
		cacheMutex.RLock()
		var cachedStatuses []ProxyStatus
		for _, status := range proxyStatusCache {
			cachedStatuses = append(cachedStatuses, status)
		}
		cacheMutex.RUnlock()

		totalProxies := len(cachedStatuses)
		unavailableCount := 0
		for _, status := range cachedStatuses {
			if !status.IsAvailable {
				unavailableCount++
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"success":          true,
			"totalProxies":     totalProxies,
			"unavailableCount": unavailableCount,
			"proxyStatuses":    cachedStatuses,
			"timestamp":        time.Now().UTC().Format(time.RFC3339),
			"cached":           true,
			"cacheTime":        cacheTimestamp.Format(time.RFC3339),
		})
		return
	}

	// 如果没有缓存数据且不允许直接检测，要求先使用异步检测
	if !cacheExists && !allowDirectCheck {
		c.JSON(http.StatusBadRequest, gin.H{
			"success":    false,
			"error":      "No cache data available",
			"message":    "请先使用后台全量检测功能获取数据，或者使用异步检测接口",
			"suggestion": "POST /api/proxy/check/async 或者添加参数 ?allow_direct=true",
		})
		return
	}

	// 如果缓存过期且要求强制刷新，但不允许直接检测
	if cacheExists && !cacheValid && forceRefresh && !allowDirectCheck {
		c.JSON(http.StatusBadRequest, gin.H{
			"success":    false,
			"error":      "Cache expired, direct refresh not allowed",
			"message":    "缓存已过期，建议使用异步检测接口更新数据",
			"suggestion": "POST /api/proxy/check/async",
			"cacheAge":   time.Since(cacheTimestamp).String(),
		})
		return
	}
	// 获取所有使用代理的设备
	aiBoxDevices, err := getAIBoxDevicesWithProxy()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch AI box devices",
			"message": err.Error(),
		})
		return
	}

	cloudDevices, err := getCloudDevicesWithProxy()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch cloud devices",
			"message": err.Error(),
		})
		return
	}

	// 合并设备列表并按proxy_id分组
	devicesByProxy := make(map[int64][]DeviceInfo)
	proxyIDs := make(map[int64]bool)

	// 处理AI盒子设备
	for _, device := range aiBoxDevices {
		if device.ProxyID > 0 {
			devicesByProxy[device.ProxyID] = append(devicesByProxy[device.ProxyID], DeviceInfo{
				ID:         device.ID,
				DevCode:    device.DevCode,
				DevText:    device.DevText,
				DeviceType: "ai_box",
				IsOnline:   device.IsOnline,
				MerchantID: device.MerchantID,
			})
			proxyIDs[device.ProxyID] = true
		}
	}

	// 处理云设备
	for _, device := range cloudDevices {
		if device.ProxyID > 0 {
			devicesByProxy[device.ProxyID] = append(devicesByProxy[device.ProxyID], DeviceInfo{
				ID:         device.ID,
				DevCode:    device.DevCode,
				DevText:    device.DevText,
				DeviceType: "cloud",
				IsOnline:   int8(device.IsOnline),
				MerchantID: device.MerchantID,
			})
			proxyIDs[device.ProxyID] = true
		}
	}

	// 获取代理信息
	var proxyInfos []ProxyInfo
	var proxyIDList []int64
	for proxyID := range proxyIDs {
		proxyIDList = append(proxyIDList, proxyID)
	}

	if len(proxyIDList) > 0 {
		err := db.G.Table("proxy").
			Where("id IN ? AND deleted_at IS NULL", proxyIDList).
			Scan(&proxyInfos).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to fetch proxy info",
				"message": err.Error(),
			})
			return
		}
	}

	// 检测代理可用性 - 使用并发检测，限制同时检测数量
	var proxyStatuses []ProxyStatus
	concurrentLimit := 50 // 限制并发数量
	semaphore := make(chan struct{}, concurrentLimit)
	var wg sync.WaitGroup
	var mutex sync.Mutex

	for _, proxy := range proxyInfos {
		wg.Add(1)
		go func(p ProxyInfo) {
			defer wg.Done()
			semaphore <- struct{}{}        // 获取信号量
			defer func() { <-semaphore }() // 释放信号量

			devices := devicesByProxy[p.ID]
			status := ProxyStatus{
				ProxyInfo:    p,
				UsingDevices: devices,
				DeviceCount:  len(devices),
				CheckTime:    time.Now(),
			}

			// 检测代理可用性（使用更短的超时）
			status.IsAvailable, status.ResponseTime, status.ErrorMessage, status.TestURL = checkProxyAvailabilityFast(p)

			mutex.Lock()
			proxyStatuses = append(proxyStatuses, status)
			mutex.Unlock()
		}(proxy)
	}

	wg.Wait()

	// 更新缓存
	cacheMutex.Lock()
	proxyStatusCache = make(map[int64]ProxyStatus)
	for _, status := range proxyStatuses {
		proxyStatusCache[status.ProxyInfo.ID] = status
	}
	cacheTimestamp = time.Now()
	cacheMutex.Unlock()

	// 统计信息
	totalProxies := len(proxyStatuses)
	unavailableCount := 0
	for _, status := range proxyStatuses {
		if !status.IsAvailable {
			unavailableCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"totalProxies":     totalProxies,
		"unavailableCount": unavailableCount,
		"proxyStatuses":    proxyStatuses,
		"timestamp":        time.Now().UTC().Format(time.RFC3339),
		"cached":           false,
		"cacheTime":        cacheTimestamp.Format(time.RFC3339),
	})
}

// 获取使用代理的AI盒子设备（仅包含在线社媒账号关联的设备）
func getAIBoxDevicesWithProxy() ([]struct {
	ID         int64  `gorm:"column:id"`
	DevCode    string `gorm:"column:dev_code"`
	DevText    string `gorm:"column:dev_text"`
	IsOnline   int8   `gorm:"column:is_online"`
	ProxyID    int64  `gorm:"column:proxy_id"`
	MerchantID int64  `gorm:"column:merchant_id"`
}, error) {
	var devices []struct {
		ID         int64  `gorm:"column:id"`
		DevCode    string `gorm:"column:dev_code"`
		DevText    string `gorm:"column:dev_text"`
		IsOnline   int8   `gorm:"column:is_online"`
		ProxyID    int64  `gorm:"column:proxy_id"`
		MerchantID int64  `gorm:"column:merchant_id"`
	}

	err := db.G.Table("ai_box_device as abd").
		Joins("INNER JOIN social_accounts as sa ON abd.dev_code = sa.dev_code").
		Where("abd.proxy_id > 0 AND abd.deleted_at IS NULL AND sa.deleted_at IS NULL AND sa.online_status = 1").
		Select("abd.id, abd.dev_code, abd.dev_text, abd.is_online, abd.proxy_id, abd.merchant_id").
		Scan(&devices).Error

	return devices, err
}

// 获取使用代理的云设备（仅包含在线社媒账号关联的设备）
func getCloudDevicesWithProxy() ([]struct {
	ID         int64  `gorm:"column:id"`
	DevCode    string `gorm:"column:dev_code"`
	DevText    string `gorm:"column:dev_text"`
	IsOnline   int    `gorm:"column:is_online"`
	ProxyID    int64  `gorm:"column:proxy_id"`
	MerchantID int64  `gorm:"column:merchant_id"`
}, error) {
	var devices []struct {
		ID         int64  `gorm:"column:id"`
		DevCode    string `gorm:"column:dev_code"`
		DevText    string `gorm:"column:dev_text"`
		IsOnline   int    `gorm:"column:is_online"`
		ProxyID    int64  `gorm:"column:proxy_id"`
		MerchantID int64  `gorm:"column:merchant_id"`
	}

	err := db.G.Table("cloud_device as cd").
		Joins("INNER JOIN social_accounts as sa ON cd.dev_code = sa.dev_code").
		Where("cd.proxy_id > 0 AND cd.deleted_at IS NULL AND sa.deleted_at IS NULL AND sa.online_status = 1").
		Select("cd.id, cd.dev_code, cd.dev_text, cd.is_online, cd.proxy_id, cd.merchant_id").
		Scan(&devices).Error

	return devices, err
}

// checkProxyAvailabilityFast 快速检测代理可用性（用于批量检测）
func checkProxyAvailabilityFast(proxy ProxyInfo) (bool, int64, string, string) {
	testURL := "ipinfo.io"
	startTime := time.Now()

	// 构建curl命令
	var proxyURL string
	proxyProtocol := proxy.Protocol
	if proxyProtocol == "" {
		proxyProtocol = "socks5" // 默认使用socks5
	}

	if proxy.Account != "" && proxy.Password != "" {
		proxyURL = fmt.Sprintf("%s://%s:%s@%s:%s",
			proxyProtocol, proxy.Account, proxy.Password, proxy.IP, proxy.Port)
	} else {
		proxyURL = fmt.Sprintf("%s://%s:%s", proxyProtocol, proxy.IP, proxy.Port)
	}

	// 执行curl命令，设置5秒超时
	cmd := exec.Command("curl", "-x", proxyURL, "--connect-timeout", "5", "--max-time", "5", "-s", testURL)
	output, err := cmd.Output()
	responseTime := time.Since(startTime).Milliseconds()

	if err != nil {
		return false, responseTime, fmt.Sprintf("Curl command failed: %v", err), testURL
	}

	// 检查输出是否包含IP信息（简单验证）
	outputStr := strings.TrimSpace(string(output))
	if len(outputStr) > 0 && (strings.Contains(outputStr, "ip") || strings.Contains(outputStr, "country") || strings.Contains(outputStr, ".")) {
		return true, responseTime, "", testURL
	}

	return false, responseTime, fmt.Sprintf("Invalid response: %s", outputStr), testURL
}

// checkProxyAvailability 检测代理可用性（详细版本，用于单个检测）
func checkProxyAvailability(proxy ProxyInfo) (bool, int64, string, string) {
	// 多个测试URL，提高检测成功率
	testURLs := []string{
		"ipinfo.io",
		"ifconfig.me/ip",
		"icanhazip.com",
	}

	startTime := time.Now()

	// 构建代理URL
	proxyProtocol := proxy.Protocol
	if proxyProtocol == "" {
		proxyProtocol = "socks5" // 默认使用socks5
	}

	var proxyURL string
	if proxy.Account != "" && proxy.Password != "" {
		proxyURL = fmt.Sprintf("%s://%s:%s@%s:%s",
			proxyProtocol, proxy.Account, proxy.Password, proxy.IP, proxy.Port)
	} else {
		proxyURL = fmt.Sprintf("%s://%s:%s", proxyProtocol, proxy.IP, proxy.Port)
	}

	// 尝试多个测试URL
	var lastError string
	for _, testURL := range testURLs {
		startTime = time.Now() // 重新计时

		// 执行curl命令，设置10秒超时
		cmd := exec.Command("curl", "-x", proxyURL, "--connect-timeout", "8", "--max-time", "10", "-s", testURL)
		output, err := cmd.Output()
		responseTime := time.Since(startTime).Milliseconds()

		if err != nil {
			lastError = fmt.Sprintf("Curl to %s failed: %v", testURL, err)
			continue
		}

		// 检查输出是否包含有效信息
		outputStr := strings.TrimSpace(string(output))
		if len(outputStr) > 0 && (strings.Contains(outputStr, "ip") ||
			strings.Contains(outputStr, "country") ||
			strings.Contains(outputStr, ".") ||
			len(strings.Fields(outputStr)) > 0) {
			return true, responseTime, "", testURL
		}

		lastError = fmt.Sprintf("Invalid response from %s: %s", testURL, outputStr)
	}

	responseTime := time.Since(startTime).Milliseconds()

	// 所有URL都失败了
	detailedError := fmt.Sprintf("All test URLs failed. Proxy: %s. Last error: %s", proxyURL, lastError)
	return false, responseTime, detailedError, testURLs[0]
}

// OnlineCloudAccountStats 在线云机账号统计结构
type OnlineCloudAccountStats struct {
	AppUniqueID   string `json:"app_unique_id"`
	Account       string `json:"account"`
	BdClientNo    string `json:"bd_client_no"`
	LoginTime     string `json:"login_time"`
	HeartbeatTime string `json:"heartbeat_time"`
}

// CloudDevice 云机设备信息
type CloudDevice struct {
	ID          int    `gorm:"column:id" json:"id"`
	DevCode     string `gorm:"column:dev_code" json:"dev_code"`
	DevText     string `gorm:"column:dev_text" json:"dev_text"`
	IsOnline    int    `gorm:"column:is_online" json:"is_online"`
	MerchantID  int    `gorm:"column:merchant_id" json:"merchant_id"`
	CountryCode string `gorm:"column:country_code" json:"country_code"`
	DevName     string `gorm:"column:dev_name" json:"dev_name"`
	CustomCode  *int   `gorm:"column:custom_code" json:"custom_code"`
}

// AiBoxDevice 盒子设备信息
type AiBoxDevice struct {
	ID             int        `gorm:"column:id" json:"id"`
	DevUID         string     `gorm:"column:dev_uid" json:"dev_uid"`
	DevCode        string     `gorm:"column:dev_code" json:"dev_code"`
	DevText        string     `gorm:"column:dev_text" json:"dev_text"`
	IsOnline       int        `gorm:"column:is_online" json:"is_online"`
	LastOnlineTime *time.Time `gorm:"column:last_online_time" json:"last_online_time"`
	CountryCode    string     `gorm:"column:country_code" json:"country_code"`
	MerchantID     int        `gorm:"column:merchant_id" json:"merchant_id"`
	DevName        string     `gorm:"column:dev_name" json:"dev_name"`
	CustomCode     *int       `gorm:"column:custom_code" json:"custom_code"`
}

// DeviceMonitorInfo 设备监控信息
type DeviceMonitorInfo struct {
	DevCode            string     `json:"dev_code"`
	DevName            string     `json:"dev_name"`
	DevText            string     `json:"dev_text"`
	DeviceType         int        `json:"device_type"` // 1=盒子, 2=云机
	DeviceTypeText     string     `json:"device_type_text"`
	IsOnlineInDB       int        `json:"is_online_in_db"`
	IsOnlineInRedis    bool       `json:"is_online_in_redis"`
	OnlineStatus       string     `json:"online_status"`
	MerchantID         int        `json:"merchant_id"`
	CountryCode        string     `json:"country_code"`
	CustomCode         *int       `json:"custom_code"`
	LastOnlineTime     *time.Time `json:"last_online_time,omitempty"`
	RedisLoginTime     string     `json:"redis_login_time,omitempty"`
	RedisHeartbeatTime string     `json:"redis_heartbeat_time,omitempty"`
	AccountCount       int        `json:"account_count"`
	OnlineAccountCount int        `json:"online_account_count"`
	Accounts           []string   `json:"accounts,omitempty"`
}

// GetOnlineCloudAccountsHandler 获取在线云机账号统计（无需鉴权）
func GetOnlineCloudAccountsHandler(c *gin.Context) {
	// 连接Redis
	rdb, err := utils.ConnectRedis()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to connect to Redis",
			"message": err.Error(),
		})
		return
	}

	// 获取Redis中所有在线用户数据
	allUsersData, err := rdb.HGetAll(context.Background(), onlineHashKey).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch users from Redis",
			"message": err.Error(),
		})
		return
	}

	// 过滤出符合条件的账号
	var validAppUniqueIDs []string
	var redisInfoMap = make(map[string]UserOnlineInfo)

	for userKey, userDataStr := range allUsersData {
		// 1. 检查userKey格式：必须包含@s.whatsapp.net，表示有号
		if !strings.Contains(userKey, "@s.whatsapp.net") {
			continue
		}

		// 2. 解析Redis数据
		var userInfo UserOnlineInfo
		if err := json.Unmarshal([]byte(userDataStr), &userInfo); err != nil {
			continue // 跳过格式错误的数据
		}

		// 3. 检查是否在线
		if !userInfo.Online {
			continue
		}

		// 4. 检查bdClientNo格式：必须是云机格式（VXLA开头）
		if !strings.HasPrefix(userInfo.BdClientNo, "VXLA") {
			continue
		}

		// 符合所有条件，添加到列表
		validAppUniqueIDs = append(validAppUniqueIDs, userKey)
		redisInfoMap[userKey] = userInfo
	}

	// 如果没有符合条件的账号
	if len(validAppUniqueIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success":        true,
			"totalCount":     0,
			"onlineAccounts": []OnlineCloudAccountStats{},
			"timestamp":      time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	// 查询social_accounts表获取账号信息
	var socialAccounts []struct {
		AppUniqueID string `gorm:"column:app_unique_id"`
		Account     string `gorm:"column:account"`
	}

	err = db.G.Table("social_accounts").
		Where("app_unique_id IN ? AND deleted_at IS NULL", validAppUniqueIDs).
		Select("app_unique_id, account").
		Scan(&socialAccounts).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch social accounts",
			"message": err.Error(),
		})
		return
	}

	// 组装最终结果
	var onlineAccounts []OnlineCloudAccountStats
	for _, socialAccount := range socialAccounts {
		if redisInfo, exists := redisInfoMap[socialAccount.AppUniqueID]; exists {
			onlineAccounts = append(onlineAccounts, OnlineCloudAccountStats{
				AppUniqueID:   socialAccount.AppUniqueID,
				Account:       socialAccount.Account,
				BdClientNo:    redisInfo.BdClientNo,
				LoginTime:     redisInfo.LoginTimeFormatted,
				HeartbeatTime: redisInfo.HeartbeatTimeFormatted,
			})
		}
	}

	// 返回结果
	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"totalCount":     len(onlineAccounts),
		"onlineAccounts": onlineAccounts,
		"summary": gin.H{
			"totalRedisUsers":  len(allUsersData),
			"validFormatUsers": len(validAppUniqueIDs),
			"foundInDatabase":  len(onlineAccounts),
		},
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// GetDeviceMonitoringHandler 获取设备监控信息
func GetDeviceMonitoringHandler(c *gin.Context) {
	// 获取查询参数
	devCode := c.Query("dev_code")
	deviceType := c.Query("device_type")     // 1=盒子, 2=云机, 空=所有
	onlineStatus := c.Query("online_status") // online, offline, redis_only, db_only, 空=所有
	page := c.DefaultQuery("page", "1")
	pageSize := c.DefaultQuery("page_size", "50")

	pageInt, _ := strconv.Atoi(page)
	pageSizeInt, _ := strconv.Atoi(pageSize)
	if pageInt < 1 {
		pageInt = 1
	}
	if pageSizeInt < 1 || pageSizeInt > 200 {
		pageSizeInt = 50
	}

	// 连接Redis
	rdb, err := utils.ConnectRedis()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to connect to Redis",
			"message": err.Error(),
		})
		return
	}
	defer rdb.Close()

	// 获取Redis中的在线数据
	allUsersData, err := rdb.HGetAll(context.Background(), onlineHashKey).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to fetch Redis data",
			"message": err.Error(),
		})
		return
	}

	// 解析Redis数据并按设备编码分组
	redisDevicesMap := make(map[string][]UserOnlineInfo)
	redisUserKeysMap := make(map[string][]string) // 存储设备编码对应的用户Key列表
	for userKey, userDataStr := range allUsersData {
		var userInfo UserOnlineInfo
		if err := json.Unmarshal([]byte(userDataStr), &userInfo); err != nil {
			continue
		}

		if userInfo.BdClientNo != "" {
			redisDevicesMap[userInfo.BdClientNo] = append(redisDevicesMap[userInfo.BdClientNo], userInfo)
			redisUserKeysMap[userInfo.BdClientNo] = append(redisUserKeysMap[userInfo.BdClientNo], userKey)
		}
	}

	var devices []DeviceMonitorInfo

	// 获取云机数据
	if deviceType == "" || deviceType == "2" {
		var cloudDevices []CloudDevice
		query := db.G.Table("cloud_device").Where("deleted_at IS NULL")

		if devCode != "" {
			query = query.Where("dev_code LIKE ?", "%"+devCode+"%")
		}

		if err := query.Find(&cloudDevices).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to fetch cloud devices",
				"message": err.Error(),
			})
			return
		}

		for _, device := range cloudDevices {
			deviceInfo := DeviceMonitorInfo{
				DevCode:        device.DevCode,
				DevName:        device.DevName,
				DevText:        device.DevText,
				DeviceType:     2,
				DeviceTypeText: "云机",
				IsOnlineInDB:   device.IsOnline,
				MerchantID:     device.MerchantID,
				CountryCode:    device.CountryCode,
				CustomCode:     device.CustomCode,
			}

			// 检查Redis中的状态
			if redisUsers, exists := redisDevicesMap[device.DevCode]; exists {
				deviceInfo.IsOnlineInRedis = true
				var onlineCount int
				var accounts []string

				// 获取对应的用户Key列表
				if userKeys, hasKeys := redisUserKeysMap[device.DevCode]; hasKeys {
					for i, user := range redisUsers {
						if user.Online {
							onlineCount++
						}
						// 提取账号信息（如果是@s.whatsapp.net格式）
						if i < len(userKeys) && strings.Contains(userKeys[i], "@s.whatsapp.net") {
							accounts = append(accounts, userKeys[i])
						}
					}
				}

				deviceInfo.OnlineAccountCount = onlineCount
				deviceInfo.AccountCount = len(redisUsers)
				if len(accounts) > 0 {
					deviceInfo.Accounts = accounts
				}
				if len(redisUsers) > 0 {
					deviceInfo.RedisLoginTime = redisUsers[0].LoginTimeFormatted
					deviceInfo.RedisHeartbeatTime = redisUsers[0].HeartbeatTimeFormatted
				}
			}

			// 设置在线状态
			if deviceInfo.IsOnlineInDB == 1 && deviceInfo.IsOnlineInRedis {
				deviceInfo.OnlineStatus = "在线"
			} else if deviceInfo.IsOnlineInDB == 1 {
				deviceInfo.OnlineStatus = "数据库在线"
			} else if deviceInfo.IsOnlineInRedis {
				deviceInfo.OnlineStatus = "Redis在线"
			} else {
				deviceInfo.OnlineStatus = "离线"
			}

			devices = append(devices, deviceInfo)
		}
	}

	// 获取盒子数据
	if deviceType == "" || deviceType == "1" {
		var aiBoxDevices []AiBoxDevice
		query := db.G.Table("ai_box_device").Where("deleted_at IS NULL")

		if devCode != "" {
			query = query.Where("dev_code LIKE ?", "%"+devCode+"%")
		}

		if err := query.Find(&aiBoxDevices).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to fetch ai box devices",
				"message": err.Error(),
			})
			return
		}

		for _, device := range aiBoxDevices {
			deviceInfo := DeviceMonitorInfo{
				DevCode:        device.DevCode,
				DevName:        device.DevName,
				DevText:        device.DevText,
				DeviceType:     1,
				DeviceTypeText: "盒子",
				IsOnlineInDB:   device.IsOnline,
				MerchantID:     device.MerchantID,
				CountryCode:    device.CountryCode,
				CustomCode:     device.CustomCode,
				LastOnlineTime: device.LastOnlineTime,
			}

			// 检查Redis中的状态
			if redisUsers, exists := redisDevicesMap[device.DevCode]; exists {
				deviceInfo.IsOnlineInRedis = true
				var onlineCount int
				var accounts []string

				// 获取对应的用户Key列表
				if userKeys, hasKeys := redisUserKeysMap[device.DevCode]; hasKeys {
					for i, user := range redisUsers {
						if user.Online {
							onlineCount++
						}
						// 提取账号信息（如果是@s.whatsapp.net格式）
						if i < len(userKeys) && strings.Contains(userKeys[i], "@s.whatsapp.net") {
							accounts = append(accounts, userKeys[i])
						}
					}
				}

				deviceInfo.OnlineAccountCount = onlineCount
				deviceInfo.AccountCount = len(redisUsers)
				if len(accounts) > 0 {
					deviceInfo.Accounts = accounts
				}
				if len(redisUsers) > 0 {
					deviceInfo.RedisLoginTime = redisUsers[0].LoginTimeFormatted
					deviceInfo.RedisHeartbeatTime = redisUsers[0].HeartbeatTimeFormatted
				}
			}

			// 设置在线状态
			if deviceInfo.IsOnlineInDB == 1 && deviceInfo.IsOnlineInRedis {
				deviceInfo.OnlineStatus = "在线"
			} else if deviceInfo.IsOnlineInDB == 1 {
				deviceInfo.OnlineStatus = "数据库在线"
			} else if deviceInfo.IsOnlineInRedis {
				deviceInfo.OnlineStatus = "Redis在线"
			} else {
				deviceInfo.OnlineStatus = "离线"
			}

			devices = append(devices, deviceInfo)
		}
	}

	// 先计算全部设备的统计信息（在过滤和分页之前）
	stats := struct {
		TotalDevices     int `json:"total_devices"`
		OnlineDevices    int `json:"online_devices"`
		OfflineDevices   int `json:"offline_devices"`
		CloudDevices     int `json:"cloud_devices"`
		BoxDevices       int `json:"box_devices"`
		RedisOnlyDevices int `json:"redis_only_devices"`
		DbOnlyDevices    int `json:"db_only_devices"`
	}{
		TotalDevices:     len(devices),
		OnlineDevices:    0,
		OfflineDevices:   0,
		CloudDevices:     0,
		BoxDevices:       0,
		RedisOnlyDevices: 0,
		DbOnlyDevices:    0,
	}

	// 计算统计信息（基于全部设备数据）
	for _, device := range devices {
		if device.DeviceType == 2 {
			stats.CloudDevices++
		} else {
			stats.BoxDevices++
		}

		if device.IsOnlineInDB == 1 && device.IsOnlineInRedis {
			stats.OnlineDevices++
		} else if device.IsOnlineInDB != 1 && !device.IsOnlineInRedis {
			stats.OfflineDevices++
		} else if device.IsOnlineInRedis && device.IsOnlineInDB != 1 {
			stats.RedisOnlyDevices++
		} else if device.IsOnlineInDB == 1 && !device.IsOnlineInRedis {
			stats.DbOnlyDevices++
		}
	}

	// 根据在线状态过滤
	if onlineStatus != "" {
		var filteredDevices []DeviceMonitorInfo
		for _, device := range devices {
			switch onlineStatus {
			case "online":
				if device.IsOnlineInDB == 1 && device.IsOnlineInRedis {
					filteredDevices = append(filteredDevices, device)
				}
			case "offline":
				if device.IsOnlineInDB != 1 && !device.IsOnlineInRedis {
					filteredDevices = append(filteredDevices, device)
				}
			case "redis_only":
				if device.IsOnlineInRedis && device.IsOnlineInDB != 1 {
					filteredDevices = append(filteredDevices, device)
				}
			case "db_only":
				if device.IsOnlineInDB == 1 && !device.IsOnlineInRedis {
					filteredDevices = append(filteredDevices, device)
				}
			}
		}
		devices = filteredDevices
	}

	// 分页处理
	total := len(devices)
	start := (pageInt - 1) * pageSizeInt
	end := start + pageSizeInt

	if start >= total {
		devices = []DeviceMonitorInfo{}
	} else {
		if end > total {
			end = total
		}
		devices = devices[start:end]
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"devices":    devices,
		"total":      total,
		"page":       pageInt,
		"page_size":  pageSizeInt,
		"statistics": stats,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})
}

// FindReplacementProxyHandler 查找替代代理
func FindReplacementProxyHandler(c *gin.Context) {
	var req struct {
		ProxyID int64 `json:"proxy_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request parameters"})
		return
	}

	// 获取当前代理信息
	var currentProxy ProxyInfo
	err := db.G.Table("proxy").
		Where("id = ? AND deleted_at IS NULL", req.ProxyID).
		First(&currentProxy).Error
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Proxy not found",
			"message": err.Error(),
		})
		return
	}

	// 查找同merchant_id和country_code的可用代理
	replacement, found, err := findAvailableReplacement(currentProxy.MerchantID, currentProxy.ID, currentProxy.CountryCode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to find replacement proxy",
			"message": err.Error(),
		})
		return
	}

	if !found {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "No available replacement proxy found",
			"message": "未找到相同merchant_id下的可用替代代理",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"currentProxy":     currentProxy,
		"replacementProxy": replacement,
		"timestamp":        time.Now().UTC().Format(time.RFC3339),
	})
}

// findAvailableReplacement 查找可用的替代代理
func findAvailableReplacement(merchantID int64, excludeProxyID int64, contry_code string) (ProxyInfo, bool, error) {
	// 获取同merchant_id的所有代理，排除当前代理
	var proxies []ProxyInfo
	err := db.G.Table("proxy").
		Where("merchant_id = ? AND id != ? AND  deleted_at IS NULL", merchantID, excludeProxyID).
		Where("country_code = ?", contry_code).
		Scan(&proxies).Error
	if err != nil {
		return ProxyInfo{}, false, err
	}

	// 测试每个代理的可用性，返回第一个可用的
	for _, proxy := range proxies {
		isAvailable, _, _, _ := checkProxyAvailability(proxy)
		if isAvailable {
			return proxy, true, nil
		}
	}

	return ProxyInfo{}, false, nil
}

// ReplaceProxyHandler 一键更换代理
func ReplaceProxyHandler(c *gin.Context) {
	var req struct {
		OldProxyID int64 `json:"old_proxy_id"`
		NewProxyID int64 `json:"new_proxy_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request parameters"})
		return
	}

	// 获取旧代理信息
	var oldProxy ProxyInfo
	err := db.G.Table("proxy").
		Where("id = ? AND deleted_at IS NULL", req.OldProxyID).
		First(&oldProxy).Error
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Old proxy not found",
			"message": err.Error(),
		})
		return
	}

	// 验证新代理存在且可用
	var newProxy ProxyInfo
	err = db.G.Table("proxy").
		Where("id = ? AND deleted_at IS NULL", req.NewProxyID).
		First(&newProxy).Error
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "New proxy not found",
			"message": err.Error(),
		})
		return
	}

	// 检查新代理是否可用
	isAvailable, _, errorMsg, _ := checkProxyAvailability(newProxy)
	if !isAvailable {
		// 记录更换失败的日志
		if logErr := LogProxyReplacement(
			int(oldProxy.ID), int(newProxy.ID),
			int(oldProxy.MerchantID), int(newProxy.MerchantID),
			oldProxy.IP, oldProxy.Port,
			newProxy.IP, newProxy.Port,
			false, 0,
			"代理不可用",
			errorMsg,
			"system", "auto",
		); logErr != nil {
			fmt.Printf("Failed to log proxy replacement: %v\n", logErr)
		}

		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "New proxy is not available",
			"message": errorMsg,
		})
		return
	}

	// 获取使用旧代理的设备列表
	aiBoxDevices, cloudDevices, totalCount, err := getDevicesUsingProxy(req.OldProxyID)
	if err != nil {
		// 记录更换失败的日志
		if logErr := LogProxyReplacement(
			int(oldProxy.ID), int(newProxy.ID),
			int(oldProxy.MerchantID), int(newProxy.MerchantID),
			oldProxy.IP, oldProxy.Port,
			newProxy.IP, newProxy.Port,
			false, 0,
			"获取设备列表失败",
			err.Error(),
			"system", "manual",
		); logErr != nil {
			fmt.Printf("Failed to log proxy replacement: %v\n", logErr)
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get devices using proxy",
			"message": err.Error(),
		})
		return
	}

	// 如果没有设备使用该代理，直接返回成功
	if totalCount == 0 {
		// 记录更换日志
		if logErr := LogProxyReplacement(
			int(oldProxy.ID), int(newProxy.ID),
			int(oldProxy.MerchantID), int(newProxy.MerchantID),
			oldProxy.IP, oldProxy.Port,
			newProxy.IP, newProxy.Port,
			true, 0,
			"手动更换代理（无设备使用）",
			"",
			"system", "manual",
		); logErr != nil {
			fmt.Printf("Failed to log proxy replacement: %v\n", logErr)
		}

		c.JSON(http.StatusOK, gin.H{
			"success":        true,
			"message":        "代理更换成功（无设备使用该代理）",
			"updatedDevices": 0,
			"oldProxyID":     req.OldProxyID,
			"newProxyID":     req.NewProxyID,
			"timestamp":      time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	// 调用设置代理接口进行更换
	successCount, failureCount, err := callSetProxyAPI(aiBoxDevices, cloudDevices, req.NewProxyID)
	if err != nil {
		// 记录更换失败的日志
		if logErr := LogProxyReplacement(
			int(oldProxy.ID), int(newProxy.ID),
			int(oldProxy.MerchantID), int(newProxy.MerchantID),
			oldProxy.IP, oldProxy.Port,
			newProxy.IP, newProxy.Port,
			false, successCount,
			"调用设置代理接口失败",
			err.Error(),
			"system", "manual",
		); logErr != nil {
			fmt.Printf("Failed to log proxy replacement: %v\n", logErr)
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to call set proxy API",
			"message": err.Error(),
		})
		return
	}

	// 记录更换成功的日志
	isSuccess := failureCount == 0
	reason := "手动更换代理"
	if failureCount > 0 {
		reason = fmt.Sprintf("手动更换代理（部分失败：成功%d，失败%d）", successCount, failureCount)
	}

	if logErr := LogProxyReplacement(
		int(oldProxy.ID), int(newProxy.ID),
		int(oldProxy.MerchantID), int(newProxy.MerchantID),
		oldProxy.IP, oldProxy.Port,
		newProxy.IP, newProxy.Port,
		isSuccess, successCount,
		reason,
		"",
		"system", "manual",
	); logErr != nil {
		fmt.Printf("Failed to log proxy replacement: %v\n", logErr)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"message":        "代理更换完成",
		"updatedDevices": successCount,
		"failedDevices":  failureCount,
		"totalDevices":   totalCount,
		"oldProxyID":     req.OldProxyID,
		"newProxyID":     req.NewProxyID,
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	})
}

// NotifyMerchantHandler 通知商户代理不可用（预留功能）
func NotifyMerchantHandler(c *gin.Context) {
	var req struct {
		ProxyIDs    []int64 `json:"proxy_ids"`
		MerchantIDs []int64 `json:"merchant_ids"`
		NotifyAll   bool    `json:"notify_all"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request parameters"})
		return
	}

	// TODO: 实现通知逻辑
	// 这里可以：
	// 1. 发送邮件通知
	// 2. 发送短信通知
	// 3. 系统内消息通知
	// 4. webhook通知等

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"message":           "通知功能暂未实现，敬请期待",
		"notifiedProxies":   len(req.ProxyIDs),
		"notifiedMerchants": len(req.MerchantIDs),
		"timestamp":         time.Now().UTC().Format(time.RFC3339),
	})
}

// 异步检测状态
type AsyncCheckStatus struct {
	TaskID       string     `json:"task_id"`
	Status       string     `json:"status"`   // "running", "completed", "failed"
	Progress     int        `json:"progress"` // 0-100
	Total        int        `json:"total"`
	Completed    int        `json:"completed"`
	StartTime    time.Time  `json:"start_time"`
	EndTime      *time.Time `json:"end_time,omitempty"`
	ErrorMessage string     `json:"error_message,omitempty"`
}

var (
	asyncTasks = make(map[string]*AsyncCheckStatus)
	taskMutex  sync.RWMutex
)

// StartAsyncProxyCheckHandler 启动异步代理检测
func StartAsyncProxyCheckHandler(c *gin.Context) {
	// 生成任务ID
	taskID := fmt.Sprintf("proxy-check-%d", time.Now().UnixNano())

	// 创建任务状态
	task := &AsyncCheckStatus{
		TaskID:    taskID,
		Status:    "running",
		Progress:  0,
		StartTime: time.Now(),
	}

	taskMutex.Lock()
	asyncTasks[taskID] = task
	taskMutex.Unlock()

	// 启动后台检测
	go performAsyncProxyCheck(taskID, task)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"task_id": taskID,
		"message": "代理检测任务已启动",
	})
}

// GetAsyncCheckStatusHandler 获取异步检测状态
func GetAsyncCheckStatusHandler(c *gin.Context) {
	taskID := c.Param("taskId")

	taskMutex.RLock()
	task, exists := asyncTasks[taskID]
	taskMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Task not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"task":    task,
	})
}

// 执行异步代理检测
func performAsyncProxyCheck(taskID string, task *AsyncCheckStatus) {
	defer func() {
		if r := recover(); r != nil {
			taskMutex.Lock()
			task.Status = "failed"
			task.ErrorMessage = fmt.Sprintf("Panic: %v", r)
			endTime := time.Now()
			task.EndTime = &endTime
			taskMutex.Unlock()
		}
	}()

	// 获取所有使用代理的设备
	aiBoxDevices, err := getAIBoxDevicesWithProxy()
	if err != nil {
		taskMutex.Lock()
		task.Status = "failed"
		task.ErrorMessage = "Failed to fetch AI box devices: " + err.Error()
		endTime := time.Now()
		task.EndTime = &endTime
		taskMutex.Unlock()
		return
	}

	cloudDevices, err := getCloudDevicesWithProxy()
	if err != nil {
		taskMutex.Lock()
		task.Status = "failed"
		task.ErrorMessage = "Failed to fetch cloud devices: " + err.Error()
		endTime := time.Now()
		task.EndTime = &endTime
		taskMutex.Unlock()
		return
	}

	// 合并设备列表并按proxy_id分组
	devicesByProxy := make(map[int64][]DeviceInfo)
	proxyIDs := make(map[int64]bool)

	// 处理AI盒子设备
	for _, device := range aiBoxDevices {
		if device.ProxyID > 0 {
			devicesByProxy[device.ProxyID] = append(devicesByProxy[device.ProxyID], DeviceInfo{
				ID:         device.ID,
				DevCode:    device.DevCode,
				DevText:    device.DevText,
				DeviceType: "ai_box",
				IsOnline:   device.IsOnline,
				MerchantID: device.MerchantID,
			})
			proxyIDs[device.ProxyID] = true
		}
	}

	// 处理云设备
	for _, device := range cloudDevices {
		if device.ProxyID > 0 {
			devicesByProxy[device.ProxyID] = append(devicesByProxy[device.ProxyID], DeviceInfo{
				ID:         device.ID,
				DevCode:    device.DevCode,
				DevText:    device.DevText,
				DeviceType: "cloud",
				IsOnline:   int8(device.IsOnline),
				MerchantID: device.MerchantID,
			})
			proxyIDs[device.ProxyID] = true
		}
	}

	// 获取代理信息
	var proxyInfos []ProxyInfo
	var proxyIDList []int64
	for proxyID := range proxyIDs {
		proxyIDList = append(proxyIDList, proxyID)
	}

	if len(proxyIDList) > 0 {
		err := db.G.Table("proxy").
			Where("id IN ? AND deleted_at IS NULL", proxyIDList).
			Scan(&proxyInfos).Error
		if err != nil {
			taskMutex.Lock()
			task.Status = "failed"
			task.ErrorMessage = "Failed to fetch proxy info: " + err.Error()
			endTime := time.Now()
			task.EndTime = &endTime
			taskMutex.Unlock()
			return
		}
	}

	// 更新任务总数
	taskMutex.Lock()
	task.Total = len(proxyInfos)
	taskMutex.Unlock()

	// 检测代理可用性 - 使用并发检测
	var proxyStatuses []ProxyStatus
	concurrentLimit := 100 // 异步检测时可以用更高的并发数
	semaphore := make(chan struct{}, concurrentLimit)
	var wg sync.WaitGroup
	var mutex sync.Mutex

	for _, proxy := range proxyInfos {
		wg.Add(1)
		go func(p ProxyInfo) {
			defer wg.Done()
			semaphore <- struct{}{}        // 获取信号量
			defer func() { <-semaphore }() // 释放信号量

			devices := devicesByProxy[p.ID]
			status := ProxyStatus{
				ProxyInfo:    p,
				UsingDevices: devices,
				DeviceCount:  len(devices),
				CheckTime:    time.Now(),
			}

			// 检测代理可用性
			status.IsAvailable, status.ResponseTime, status.ErrorMessage, status.TestURL = checkProxyAvailabilityFast(p)

			mutex.Lock()
			proxyStatuses = append(proxyStatuses, status)

			// 更新进度
			completed := len(proxyStatuses)
			progress := int(float64(completed) / float64(task.Total) * 100)

			taskMutex.Lock()
			task.Completed = completed
			task.Progress = progress
			taskMutex.Unlock()

			mutex.Unlock()
		}(proxy)
	}

	wg.Wait()

	// 更新缓存
	cacheMutex.Lock()
	proxyStatusCache = make(map[int64]ProxyStatus)
	for _, status := range proxyStatuses {
		proxyStatusCache[status.ProxyInfo.ID] = status
	}
	cacheTimestamp = time.Now()
	cacheMutex.Unlock()

	// 任务完成
	taskMutex.Lock()
	task.Status = "completed"
	task.Progress = 100
	task.Completed = len(proxyStatuses)
	endTime := time.Now()
	task.EndTime = &endTime
	taskMutex.Unlock()
}

// DeviceForProxy 用于设置代理接口的设备结构
type DeviceForProxy struct {
	DeviceID   string `json:"device_id"`   // dev_code
	DeviceType int    `json:"device_type"` // 1=盒子, 2=云机
	ProxyID    int64  `json:"proxy_id"`    // 新的代理ID
}

// getDevicesUsingProxy 获取使用指定代理的设备列表
func getDevicesUsingProxy(proxyID int64) ([]DeviceForProxy, []DeviceForProxy, int, error) {
	var aiBoxDevices []DeviceForProxy
	var cloudDevices []DeviceForProxy

	// 获取使用该代理的AI盒子设备
	var aiBoxResults []struct {
		DevCode string `gorm:"column:dev_code"`
	}
	err := db.G.Table("ai_box_device").
		Where("proxy_id = ? AND deleted_at IS NULL", proxyID).
		Select("dev_code").
		Scan(&aiBoxResults).Error
	if err != nil {
		return nil, nil, 0, fmt.Errorf("failed to get ai box devices: %v", err)
	}

	for _, device := range aiBoxResults {
		aiBoxDevices = append(aiBoxDevices, DeviceForProxy{
			DeviceID:   device.DevCode,
			DeviceType: 1,
		})
	}

	// 获取使用该代理的云设备
	var cloudResults []struct {
		DevCode string `gorm:"column:dev_code"`
	}
	err = db.G.Table("cloud_device").
		Where("proxy_id = ? AND deleted_at IS NULL", proxyID).
		Select("dev_code").
		Scan(&cloudResults).Error
	if err != nil {
		return nil, nil, 0, fmt.Errorf("failed to get cloud devices: %v", err)
	}

	for _, device := range cloudResults {
		cloudDevices = append(cloudDevices, DeviceForProxy{
			DeviceID:   device.DevCode,
			DeviceType: 2,
		})
	}

	totalCount := len(aiBoxDevices) + len(cloudDevices)
	return aiBoxDevices, cloudDevices, totalCount, nil
}

// callSetProxyAPI 调用设置代理接口
func callSetProxyAPI(aiBoxDevices, cloudDevices []DeviceForProxy, newProxyID int64) (int, int, error) {
	// 合并设备列表并设置新的代理ID
	var allDevices []DeviceForProxy

	for _, device := range aiBoxDevices {
		device.ProxyID = newProxyID
		allDevices = append(allDevices, device)
	}

	for _, device := range cloudDevices {
		device.ProxyID = newProxyID
		allDevices = append(allDevices, device)
	}

	if len(allDevices) == 0 {
		return 0, 0, nil
	}

	// 序列化请求数据
	jsonData, err := json.Marshal(allDevices)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to marshal request data: %v", err)
	}

	// 发送HTTP请求
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("POST", "http://127.0.0.1:8090/api/v1/internal/cloud/batch/set-proxy", bytes.NewBuffer(jsonData))
	if err != nil {
		return 0, 0, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to send request: %v", err)
	}
	defer resp.Body.Close()

	// 解析响应
	var response struct {
		Code int            `json:"code"`
		Msg  string         `json:"msg"`
		Data map[string]any `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return 0, 0, fmt.Errorf("failed to decode response: %v", err)
	}

	if response.Code != 200 {
		return 0, len(allDevices), fmt.Errorf("set proxy API failed: %s", response.Msg)
	}

	return len(allDevices), 0, nil
}
