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
	ticker := time.NewTicker(5 * time.Minute)
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

// DeviceBasicInfo to hold basic device info
type DeviceBasicInfo struct {
	ID         int64
	ProxyID    int64
	MerchantID int64
	DeviceType string // "ai_box_device" or "cloud_device"
}

func getDeviceBasicInfo(devCode string) (DeviceBasicInfo, bool) {
	var deviceInfo DeviceBasicInfo

	var aiBoxDevice struct {
		ID         int64
		ProxyID    int64
		MerchantID int64
	}
	if err := db.G.Table("ai_box_device").Where("dev_code = ? AND deleted_at IS NULL", devCode).Select("id, proxy_id, merchant_id").First(&aiBoxDevice).Error; err == nil {
		deviceInfo.ID = aiBoxDevice.ID
		deviceInfo.ProxyID = aiBoxDevice.ProxyID
		deviceInfo.MerchantID = aiBoxDevice.MerchantID
		deviceInfo.DeviceType = "ai_box_device"
		return deviceInfo, true
	}

	var cloudDevice struct {
		ID         int64
		ProxyID    int64
		MerchantID int64
	}
	if err := db.G.Table("cloud_device").Where("dev_code = ? AND deleted_at IS NULL", devCode).Select("id, proxy_id, merchant_id").First(&cloudDevice).Error; err == nil {
		deviceInfo.ID = cloudDevice.ID
		deviceInfo.ProxyID = cloudDevice.ProxyID
		deviceInfo.MerchantID = cloudDevice.MerchantID
		deviceInfo.DeviceType = "cloud_device"
		return deviceInfo, true
	}

	return deviceInfo, false
}

func checkAndReplaceProxyForDevice(devCode string) (bool, error) {
	if devCode == "" {
		return true, nil // No device, no proxy, so it's "ok"
	}

	deviceInfo, found := getDeviceBasicInfo(devCode)
	if !found || deviceInfo.ProxyID == 0 {
		return true, nil // No device or no proxy assigned, consider it ok.
	}

	var proxyInfo ProxyInfo
	if err := db.G.Table("proxy").Where("id = ? AND deleted_at IS NULL", deviceInfo.ProxyID).First(&proxyInfo).Error; err != nil {
		return false, fmt.Errorf("获取代理信息失败 (ID: %d): %w", deviceInfo.ProxyID, err)
	}

	isAvailable, _, _, _ := checkProxyAvailability(proxyInfo)
	if isAvailable {
		log.Printf("信息: 设备 %s 的代理 %d (%s) 可用。", devCode, proxyInfo.ID, proxyInfo.IP)
		return true, nil
	}

	log.Printf("警告: 设备 %s 的代理 %d (%s) 不可用，尝试更换...", devCode, proxyInfo.ID, proxyInfo.IP)

	replacement, found, err := findAvailableReplacement(proxyInfo.MerchantID, proxyInfo.ID, proxyInfo.CountryCode)
	if err != nil {
		return false, fmt.Errorf("查找替代代理失败: %w", err)
	}

	if !found {
		log.Printf("警告: 设备 %s 没有找到可用的替代代理。", devCode)
		LogProxyReplacement(
			int(proxyInfo.ID), 0,
			int(proxyInfo.MerchantID), 0,
			proxyInfo.IP, proxyInfo.Port,
			"", "",
			false, 1, // 1 device affected
			"自动重启前更换失败", "未找到可用替代代理",
			"system", "auto-restart",
		)
		return false, nil
	}

	log.Printf("信息: 为设备 %s 找到替代代理 %d (%s)。正在更新...", devCode, replacement.ID, replacement.IP)

	if err := db.G.Table(deviceInfo.DeviceType).Where("id = ?", deviceInfo.ID).Update("proxy_id", replacement.ID).Error; err != nil {
		LogProxyReplacement(
			int(proxyInfo.ID), int(replacement.ID),
			int(proxyInfo.MerchantID), int(replacement.MerchantID),
			proxyInfo.IP, proxyInfo.Port,
			replacement.IP, replacement.Port,
			false, 1,
			"自动重启前更换失败", fmt.Sprintf("更新设备代理失败: %v", err),
			"system", "auto-restart",
		)
		return false, fmt.Errorf("更新设备 %s 的代理失败: %w", devCode, err)
	}

	LogProxyReplacement(
		int(proxyInfo.ID), int(replacement.ID),
		int(proxyInfo.MerchantID), int(replacement.MerchantID),
		proxyInfo.IP, proxyInfo.Port,
		replacement.IP, replacement.Port,
		true, 1,
		"自动重启前更换成功", "",
		"system", "auto-restart",
	)

	invalidateProxyCache(proxyInfo.ID)
	invalidateProxyCache(replacement.ID)

	log.Printf("成功: 设备 %s 的代理已从 %d 更新为 %d。", devCode, proxyInfo.ID, replacement.ID)
	return true, nil
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
		Select("id, merchant_id, account, app_unique_id, platform_id, online_status, account_status, dev_code,account_type").
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

	// 遍历从数据库获取的账号
	for _, account := range accounts {
		userKey := account.AppUniqueID
		userDataStr, inRedis := allUsersData[userKey]

		var onlineInfo UserOnlineInfo
		isOffline := false

		if !inRedis {
			// 不在Redis中，视为离线
			isOffline = true
			// 为后续处理创建一个模拟的 onlineInfo
			onlineInfo = UserOnlineInfo{
				Online:        false,
				HeartbeatTime: 0, // 没有心跳信息
				BdClientNo:    account.DevCode,
				PlatformId:    fmt.Sprintf("%d", account.AccountType),
			}
			log.Printf("信息: 账号 %s 在Redis中未找到，视为离线处理。", userKey)
		} else {
			// 在Redis中，解析数据并检查是否离线
			if err := json.Unmarshal([]byte(userDataStr), &onlineInfo); err != nil {
				log.Printf("错误: 解析账号 %s 的Redis数据失败: %v", userKey, err)
				continue
			}
			if !onlineInfo.Online {
				isOffline = true
			}
		}

		// 如果账号在线，则跳过
		if !isOffline {
			continue
		}

		// --- 从这里开始，是所有离线账号（无论是否在Redis中）的通用处理逻辑 ---

		// 1. 检查设备编码是否匹配 (仅当账号在Redis中时)
		// if inRedis && account.DevCode != onlineInfo.BdClientNo {
		// 	log.Printf("警告: 账号 %s 的设备编码不匹配。数据库: %s, Redis: %s。跳过此账号。", userKey, account.DevCode, onlineInfo.BdClientNo)
		// 	continue
		// }

		// 2. 检查设备编码是否存在 (数据库查询已保证 dev_code 非空)
		if account.DevCode == "" {
			continue
		}

		// 3. 检查设备本身是否在线，如果设备在线则不重启
		// if v, ok := keyMap[account.DevCode]; ok && v.Online {
		// 	continue
		// }

		// 4. 重启频率限制检查
		redisCtx := context.Background()
		redisKey := fmt.Sprintf("account:restart:count:%s", userKey)

		count, err := rdb.Incr(redisCtx, redisKey).Result()
		if err != nil {
			log.Printf("错误: Redis INCR 失败 for key %s: %v", redisKey, err)
			continue
		}

		rdb.Expire(redisCtx, redisKey, 15*time.Minute)

		// 新增：检查并更换代理
		if account.DevCode != "" {
			_, err := checkAndReplaceProxyForDevice(account.DevCode)
			if err != nil {
				log.Printf("错误: 检查或更换代理失败 for device %s: %v", account.DevCode, err)
			}
			// if proxyOK {
			// 	log.Printf("信息: 设备 %s 的代理不可用且无法更换，跳过重启账号 %s。", account.DevCode, account.AppUniqueID)
			// 	continue // Skip to next account
			// }
		}

		// 等待一段时间，看看状态恢复了没有，如果恢复了，就不必重启了
		time.Sleep(90 * time.Second)
		// 再次查询一下在线状态
		var latestOnlineStatus int
		if err := db.G.Table("social_accounts").Where("id = ?", account.ID).Select("online_status").Scan(&latestOnlineStatus).Error; err != nil {
			log.Printf("错误: 查询账号 %s 最新在线状态失败: %v", userKey, err)
			continue
		}
		if latestOnlineStatus == 1 {
			log.Printf("信息: 账号 %s 在等待期间已恢复在线，跳过重启。", userKey)
			continue
		}

		// 如果60分钟内重启次数超过6次，则标记为异常

		if count > 6 {
			log.Printf("警告: 账号 %s 在15分钟内重启次数超过6次，将被标记为异常。", userKey)
			// 看看状态还是不是1，如果不是就不更新了，因为有可能被封号了
			var status int
			if err := db.G.Table("social_accounts").Where("id = ?", account.ID).Select("account_status").Scan(&status).Error; err != nil {
				log.Printf("错误: 查询账号 %s 状态失败: %v", userKey, err)
				continue
			}
			if status != 1 {
				log.Printf("信息: 账号 %s 当前状态为 %d，跳过标记为异常。", userKey, status)
				rdb.Del(redisCtx, redisKey)
				continue
			}
			// 更新状态为异常 (4)
			if err := db.G.Table("social_accounts").Where("id = ?", account.ID).Update("account_status", 4).Error; err != nil {
				log.Printf("错误: 更新账号 %s 状态为异常失败: %v", userKey, err)
			} else {
				log.Printf("成功: 账号 %s 已被标记为异常 (account_status = 4)。", userKey)
				rdb.Del(redisCtx, redisKey)
			}
			continue
		}

		// 5. 确定设备类型
		devType := 0
		var getDevType = func() int {
			if isValidBaiduYun(account.DevCode) {
				return 2 // 百度云机
			} else if isValidBoxYun(account.DevCode) {
				return 1 // 盒子云机
			}
			return 0
		}
		devType = getDevType()

		if devType == 0 {
			log.Printf("警告: 账号 %s 的设备类型无法识别: %s", userKey, account.DevCode)
			continue // 无法识别的设备类型
		}

		// 6. 确定应用包名
		pkg := "com.whatsapp"
		if account.AccountType == 2 { // 使用数据库中的 PlatformId
			pkg = "com.whatsapp.w4b"
		}

		// 7，启动数据库里面账号绑定的云机
		restartAccount := RestartAccountInfo{
			Account:       account.Account,
			AppUniqueID:   userKey,
			DevCode:       account.DevCode,
			DevType:       devType,
			PlatformId:    fmt.Sprintf("%d", account.AccountType),
			Pkg:           pkg,
			HeartbeatTime: onlineInfo.HeartbeatTime, // 来自真实或模拟的 info
			OnlineInfo:    onlineInfo,               // 真实或模拟的 info
		}

		restartAccounts = append(restartAccounts, restartAccount)

		// 8，启动redis里面账号绑定的云机（如果和数据库不一样的话）
		if account.DevCode == onlineInfo.BdClientNo {
			restartAccount = RestartAccountInfo{
				Account:       account.Account,
				AppUniqueID:   userKey,
				DevCode:       onlineInfo.BdClientNo,
				DevType:       getDevType(),
				PlatformId:    fmt.Sprintf("%d", account.AccountType),
				Pkg:           pkg,
				HeartbeatTime: onlineInfo.HeartbeatTime, // 来自真实或模拟的 info
				OnlineInfo:    onlineInfo,               // 真实或模拟的 info
			}

			restartAccounts = append(restartAccounts, restartAccount)
		}
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
