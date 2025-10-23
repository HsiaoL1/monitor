package api

import (
	"context"
	"control/go_server/db"
	"control/go_server/internal/utils"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	autoRestartTaskRunning   bool
	autoRestartTaskMutex     sync.Mutex
	autoRestartTaskCancel    context.CancelFunc
	autoRestartStatusMessage string
)

func init() {
	autoRestartTaskRunning = false
	autoRestartStatusMessage = "已停止"
}

// StartAutoAccountRestartHandler 启动自动账号重启任务
func StartAutoAccountRestartHandler(c *gin.Context) {
	autoRestartTaskMutex.Lock()
	defer autoRestartTaskMutex.Unlock()

	if autoRestartTaskRunning {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "自动重启任务已在运行中",
		})
		return
	}

	// 创建可取消的context
	ctx, cancel := context.WithCancel(context.Background())
	autoRestartTaskCancel = cancel
	autoRestartTaskRunning = true
	autoRestartStatusMessage = "正在启动..."

	// 启动后台worker
	go autoAccountRestartWorker(ctx)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "自动账号重启任务已启动",
	})
}

// StopAutoAccountRestartHandler 停止自动账号重启任务
func StopAutoAccountRestartHandler(c *gin.Context) {
	autoRestartTaskMutex.Lock()
	defer autoRestartTaskMutex.Unlock()

	if !autoRestartTaskRunning {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "自动重启任务当前未运行",
		})
		return
	}

	if autoRestartTaskCancel != nil {
		autoRestartTaskCancel()
	}

	autoRestartTaskRunning = false
	autoRestartStatusMessage = "已停止"

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "自动账号重启任务已停止",
	})
}

// GetAutoAccountRestartStatusHandler 获取自动重启状态
func GetAutoAccountRestartStatusHandler(c *gin.Context) {
	autoRestartTaskMutex.Lock()
	isRunning := autoRestartTaskRunning
	statusMessage := autoRestartStatusMessage
	autoRestartTaskMutex.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"isRunning":     isRunning,
		"statusMessage": statusMessage,
		"timestamp":     time.Now().UTC().Format(time.RFC3339),
	})
}

// autoAccountRestartWorker 后台自动重启工作进程
func autoAccountRestartWorker(ctx context.Context) {
	log.Println("自动账号重启 Worker 已启动")

	// 立即执行一次
	executeAccountRestart()

	// 每30分钟执行一次检测（可根据需要调整）
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("自动账号重启 Worker 已停止")
			autoRestartTaskMutex.Lock()
			autoRestartTaskRunning = false
			autoRestartStatusMessage = "已停止"
			autoRestartTaskMutex.Unlock()
			return
		case <-ticker.C:
			executeAccountRestart()
		}
	}
}

// executeAccountRestart 执行账号重启检测和操作
func executeAccountRestart() {
	log.Println("开始执行账号自动重启检测...")

	autoRestartTaskMutex.Lock()
	autoRestartStatusMessage = "正在检测需要重启的账号..."
	autoRestartTaskMutex.Unlock()

	// 连接Redis
	rdb, err := utils.ConnectRedis()
	if err != nil {
		log.Printf("错误: 连接Redis失败: %v", err)
		autoRestartTaskMutex.Lock()
		autoRestartStatusMessage = fmt.Sprintf("错误: 连接Redis失败: %v", err)
		autoRestartTaskMutex.Unlock()
		return
	}
	defer rdb.Close()

	// 获取所有有dev_code且状态正常的社媒账号
	var accounts []SocialAccount
	if err := db.G.Table("social_accounts").
		Where("deleted_at IS NULL AND dev_code IS NOT NULL AND dev_code != '' AND account_status = 1").
		Select("id, merchant_id, account, app_unique_id, platform_id, online_status, account_status, dev_code").
		Scan(&accounts).Error; err != nil {
		log.Printf("错误: 获取社媒账号失败: %v", err)
		autoRestartTaskMutex.Lock()
		autoRestartStatusMessage = fmt.Sprintf("错误: 获取社媒账号失败: %v", err)
		autoRestartTaskMutex.Unlock()
		return
	}

	if len(accounts) == 0 {
		log.Println("没有找到需要检查的账号")
		autoRestartTaskMutex.Lock()
		autoRestartStatusMessage = "没有需要检查的账号，等待下一轮。"
		autoRestartTaskMutex.Unlock()
		return
	}

	autoRestartTaskMutex.Lock()
	autoRestartStatusMessage = fmt.Sprintf("正在检查 %d 个账号的状态...", len(accounts))
	autoRestartTaskMutex.Unlock()

	// 获取Redis中所有在线用户数据
	allUsersData, err := rdb.HGetAll(context.Background(), onlineHashKey).Result()
	if err != nil {
		log.Printf("错误: 获取Redis在线数据失败: %v", err)
		autoRestartTaskMutex.Lock()
		autoRestartStatusMessage = fmt.Sprintf("错误: 获取Redis在线数据失败: %v", err)
		autoRestartTaskMutex.Unlock()
		return
	}

	// 构建设备编码到在线信息的映射
	keyMap := make(map[string]UserOnlineInfo)
	for key, value := range allUsersData {
		var onlineInfo UserOnlineInfo
		if err := json.Unmarshal([]byte(value), &onlineInfo); err != nil {
			continue
		}
		if strings.HasPrefix(key, "WHATSAPP=") || strings.HasPrefix(key, "QY_WHATSAPP=") {
			keyMap[onlineInfo.BdClientNo] = onlineInfo
		}
	}

	// 查找符合重启条件的账号
	var restartAccounts []RestartAccountInfo
	currentTime := time.Now().Unix()

	for userKey, userDataStr := range allUsersData {
		// 1. 检查是否为WhatsApp账号格式
		if !isValidWhatsAppEmail(userKey) {
			continue
		}

		var onlineInfo UserOnlineInfo
		if err := json.Unmarshal([]byte(userDataStr), &onlineInfo); err != nil {
			continue
		}

		// 2. 检查是否为离线状态
		if onlineInfo.Online {
			continue
		}

		// 3. 检查心跳是否在3分钟内（180秒）
		if currentTime-onlineInfo.HeartbeatTime > 180 {
			continue
		}

		// 4. 检查设备编码是否存在且对应的设备在线状态
		if onlineInfo.BdClientNo == "" {
			continue
		}

		// 5. 检查设备是否有对应的在线连接且在线
		if v, ok := keyMap[onlineInfo.BdClientNo]; ok && v.Online && v.HeartbeatTime > currentTime-180 {
			continue
		}

		// 6. 查找对应的数据库账号记录
		var matchedAccount *SocialAccount
		for _, account := range accounts {
			if account.AppUniqueID == userKey && account.DevCode == onlineInfo.BdClientNo {
				matchedAccount = &account
				break
			}
		}

		if matchedAccount == nil {
			continue
		}

		// 确定设备类型
		devType := 0
		if isValidBaiduYun(onlineInfo.BdClientNo) {
			devType = 2 // 百度云机
		} else if isValidBoxYun(onlineInfo.BdClientNo) {
			devType = 1 // 盒子云机
		}

		if devType == 0 {
			continue // 无法识别的设备类型
		}

		// 确定应用包名
		pkg := "com.whatsapp"
		if onlineInfo.PlatformId == "2" {
			pkg = "com.whatsapp.w4b"
		}

		restartAccount := RestartAccountInfo{
			Account:       matchedAccount.Account,
			AppUniqueID:   userKey,
			DevCode:       onlineInfo.BdClientNo,
			DevType:       devType,
			PlatformId:    onlineInfo.PlatformId,
			Pkg:           pkg,
			HeartbeatTime: onlineInfo.HeartbeatTime,
			OnlineInfo:    onlineInfo,
		}

		restartAccounts = append(restartAccounts, restartAccount)
	}

	if len(restartAccounts) == 0 {
		log.Println("没有找到需要重启的账号")
		autoRestartTaskMutex.Lock()
		autoRestartStatusMessage = "没有需要重启的账号，等待下一轮。"
		autoRestartTaskMutex.Unlock()
		return
	}

	log.Printf("发现 %d 个需要重启的账号，开始执行重启...", len(restartAccounts))
	autoRestartTaskMutex.Lock()
	autoRestartStatusMessage = fmt.Sprintf("正在重启 %d 个账号...", len(restartAccounts))
	autoRestartTaskMutex.Unlock()

	// 并发执行重启，但限制并发数量避免过载
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 5) // 限制并发为5
	restartCount := 0
	errorCount := 0
	var mu sync.Mutex

	for _, restartInfo := range restartAccounts {
		wg.Add(1)
		go func(info RestartAccountInfo) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			success := executeRestartOperation(info)

			mu.Lock()
			if success {
				restartCount++
			} else {
				errorCount++
			}
			mu.Unlock()
		}(restartInfo)
	}

	wg.Wait()

	log.Printf("账号自动重启完成: 成功 %d，失败 %d", restartCount, errorCount)
	autoRestartTaskMutex.Lock()
	if errorCount == 0 {
		autoRestartStatusMessage = fmt.Sprintf("重启完成: 成功重启 %d 个账号，等待下一轮。", restartCount)
	} else {
		autoRestartStatusMessage = fmt.Sprintf("重启完成: 成功 %d，失败 %d，等待下一轮。", restartCount, errorCount)
	}
	autoRestartTaskMutex.Unlock()
}

// RestartAccountInfo 重启账号信息
type RestartAccountInfo struct {
	Account       string         `json:"account"`
	AppUniqueID   string         `json:"app_unique_id"`
	DevCode       string         `json:"dev_code"`
	DevType       int            `json:"dev_type"`
	PlatformId    string         `json:"platform_id"`
	Pkg           string         `json:"pkg"`
	HeartbeatTime int64          `json:"heartbeat_time"`
	OnlineInfo    UserOnlineInfo `json:"online_info"`
}

// executeRestartOperation 执行重启操作
func executeRestartOperation(info RestartAccountInfo) bool {
	log.Printf("正在重启账号: %s, 设备: %s, 类型: %d", info.AppUniqueID, info.DevCode, info.DevType)

	// 记录重启详细信息
	log.Printf("账号重启详情: "+
		"账号=%s, "+
		"最后心跳时间=%s, "+
		"执行时间=%s, "+
		"在线状态=%t, "+
		"设备编号=%s, "+
		"平台ID=%s",
		info.AppUniqueID,
		time.Unix(info.HeartbeatTime, 0).Format("2006-01-02 15:04:05"),
		time.Now().Format("2006-01-02 15:04:05"),
		info.OnlineInfo.Online,
		info.DevCode,
		info.PlatformId)

	// 使用 goroutine 异步执行重启
	go func() {
		// 先强制停止
		if err := ForceStop(info.DevCode, info.DevType, info.Pkg); err != nil {
			log.Printf("强制停止失败: 账号=%s, 设备=%s, 错误=%v", info.AppUniqueID, info.DevCode, err)
			return
		}

		// 等待5秒
		time.Sleep(5 * time.Second)

		// 重新启动
		if err := LaunchApp(info.DevCode, info.DevType, info.Pkg); err != nil {
			log.Printf("重新启动失败: 账号=%s, 设备=%s, 错误=%v", info.AppUniqueID, info.DevCode, err)
			return
		}

		log.Printf("账号重启成功: %s, 设备: %s", info.AppUniqueID, info.DevCode)

		// 等待15秒让应用完全启动
		time.Sleep(15 * time.Second)
	}()

	return true
}
