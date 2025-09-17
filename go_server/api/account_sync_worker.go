package api

import (
	"context"
	"control/go_server/db"
	"control/go_server/internal/utils"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	autoSyncTaskRunning   bool
	autoSyncTaskMutex     sync.Mutex
	autoSyncTaskCancel    context.CancelFunc
	autoSyncStatusMessage string
)

func init() {
	autoSyncTaskRunning = false
	autoSyncStatusMessage = "已停止"
}

// StartAutoAccountSyncHandler 启动自动账号状态同步
func StartAutoAccountSyncHandler(c *gin.Context) {
	autoSyncTaskMutex.Lock()
	defer autoSyncTaskMutex.Unlock()

	if autoSyncTaskRunning {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "自动同步任务已在运行中",
		})
		return
	}

	// 创建可取消的context
	ctx, cancel := context.WithCancel(context.Background())
	autoSyncTaskCancel = cancel
	autoSyncTaskRunning = true
	autoSyncStatusMessage = "正在启动..."

	// 启动后台worker
	go autoAccountSyncWorker(ctx)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "自动账号状态同步任务已启动",
	})
}

// StopAutoAccountSyncHandler 停止自动账号状态同步
func StopAutoAccountSyncHandler(c *gin.Context) {
	autoSyncTaskMutex.Lock()
	defer autoSyncTaskMutex.Unlock()

	if !autoSyncTaskRunning {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "自动同步任务当前未运行",
		})
		return
	}

	if autoSyncTaskCancel != nil {
		autoSyncTaskCancel()
	}

	autoSyncTaskRunning = false
	autoSyncStatusMessage = "已停止"

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "自动账号状态同步任务已停止",
	})
}

// GetAutoAccountSyncStatusHandler 获取自动同步状态
func GetAutoAccountSyncStatusHandler(c *gin.Context) {
	autoSyncTaskMutex.Lock()
	isRunning := autoSyncTaskRunning
	statusMessage := autoSyncStatusMessage
	autoSyncTaskMutex.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"isRunning":     isRunning,
		"statusMessage": statusMessage,
		"timestamp":     time.Now().UTC().Format(time.RFC3339),
	})
}

// autoAccountSyncWorker 后台同步工作进程
func autoAccountSyncWorker(ctx context.Context) {
	log.Println("自动账号状态同步 Worker 已启动")

	// 立即执行一次
	executeAccountSync()

	// 每5分钟执行一次同步（不要太频繁，避免耗费资源）
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("自动账号状态同步 Worker 已停止")
			autoSyncTaskMutex.Lock()
			autoSyncTaskRunning = false
			autoSyncStatusMessage = "已停止"
			autoSyncTaskMutex.Unlock()
			return
		case <-ticker.C:
			executeAccountSync()
		}
	}
}

// executeAccountSync 执行账号状态同步
func executeAccountSync() {
	log.Println("开始执行账号状态自动同步...")

	autoSyncTaskMutex.Lock()
	autoSyncStatusMessage = "正在获取不匹配的账号..."
	autoSyncTaskMutex.Unlock()

	// 连接Redis
	rdb, err := utils.ConnectRedis()
	if err != nil {
		log.Printf("错误: 连接Redis失败: %v", err)
		autoSyncTaskMutex.Lock()
		autoSyncStatusMessage = fmt.Sprintf("错误: 连接Redis失败: %v", err)
		autoSyncTaskMutex.Unlock()
		return
	}
	defer rdb.Close()

	// 获取所有社媒账号
	var accounts []SocialAccount
	if err := db.G.Table("social_accounts").
		Where("deleted_at IS NULL").
		Select("id, merchant_id, account, app_unique_id, platform_id, online_status, account_status").
		Scan(&accounts).Error; err != nil {
		log.Printf("错误: 获取社媒账号失败: %v", err)
		autoSyncTaskMutex.Lock()
		autoSyncStatusMessage = fmt.Sprintf("错误: 获取社媒账号失败: %v", err)
		autoSyncTaskMutex.Unlock()
		return
	}

	if len(accounts) == 0 {
		log.Println("没有找到需要检查的账号")
		autoSyncTaskMutex.Lock()
		autoSyncStatusMessage = "没有需要检查的账号，等待下一轮。"
		autoSyncTaskMutex.Unlock()
		return
	}

	autoSyncTaskMutex.Lock()
	autoSyncStatusMessage = fmt.Sprintf("正在检查 %d 个账号的状态...", len(accounts))
	autoSyncTaskMutex.Unlock()

	// 查找状态不匹配的账号
	var mismatchedAccounts []string
	for _, account := range accounts {
		userKey := account.AppUniqueID
		redisClient := NewRedisClient(rdb, context.Background())
		redisData, err := redisClient.GetHashFieldString(onlineHashKey, userKey)

		isRedisExists := (err == nil && redisData != "")
		var statusMatch bool = true

		if isRedisExists {
			var redisInfo UserOnlineInfo
			if err := json.Unmarshal([]byte(redisData), &redisInfo); err == nil {
				// 检查心跳是否超时
				currentTime := time.Now().Unix()
				heartbeatDuration := time.Duration(currentTime-redisInfo.HeartbeatTime) * time.Second
				isHeartbeatTimeout := heartbeatDuration > HeartbeatTimeoutSeconds

				// 比较在线状态
				dbOnline := (account.OnlineStatus == 1)
				redisOnline := redisInfo.Online && !isHeartbeatTimeout
				statusMatch = (dbOnline == redisOnline)
			} else {
				statusMatch = false
			}
		} else {
			// Redis中不存在该用户，如果数据库中状态为在线则为不匹配
			statusMatch = (account.OnlineStatus != 1)
		}

		if !statusMatch {
			mismatchedAccounts = append(mismatchedAccounts, account.AppUniqueID)
		}
	}

	if len(mismatchedAccounts) == 0 {
		log.Println("所有账号状态匹配，本轮同步结束")
		autoSyncTaskMutex.Lock()
		autoSyncStatusMessage = "所有账号状态匹配，等待下一轮。"
		autoSyncTaskMutex.Unlock()
		return
	}

	log.Printf("发现 %d 个状态不匹配的账号，开始同步...", len(mismatchedAccounts))
	autoSyncTaskMutex.Lock()
	autoSyncStatusMessage = fmt.Sprintf("正在同步 %d 个不匹配的账号...", len(mismatchedAccounts))
	autoSyncTaskMutex.Unlock()

	// 并发同步，但限制并发数量以避免资源消耗过大
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 10) // 限制并发为10
	syncCount := 0
	errorCount := 0
	var mu sync.Mutex

	for _, appUniqueID := range mismatchedAccounts {
		wg.Add(1)
		go func(uid string) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			if err := syncSingleAccount(uid, rdb); err != nil {
				log.Printf("同步账号 %s 失败: %v", uid, err)
				mu.Lock()
				errorCount++
				mu.Unlock()
			} else {
				mu.Lock()
				syncCount++
				mu.Unlock()
			}
		}(appUniqueID)
	}

	wg.Wait()

	log.Printf("账号状态自动同步完成: 成功 %d，失败 %d", syncCount, errorCount)
	autoSyncTaskMutex.Lock()
	if errorCount == 0 {
		autoSyncStatusMessage = fmt.Sprintf("同步完成: 成功同步 %d 个账号，等待下一轮。", syncCount)
	} else {
		autoSyncStatusMessage = fmt.Sprintf("同步完成: 成功 %d，失败 %d，等待下一轮。", syncCount, errorCount)
	}
	autoSyncTaskMutex.Unlock()
}