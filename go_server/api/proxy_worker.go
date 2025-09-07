package api

import (
	"context"
	"control/go_server/db"
	"control/go_server/internal/storage"
	"fmt"
	"log"
	"sync"
	"time"
)

var (
	autoReplaceTaskRunning   bool
	autoReplaceTaskMutex     sync.Mutex
	autoReplaceTaskCancel    context.CancelFunc // 用于优雅地停止任务
	autoReplaceStatusMessage string
	proxyReplaceLogStorage   *storage.ProxyLogStorage
)

func init() {
	autoReplaceTaskRunning = false
	autoReplaceStatusMessage = "已停止"
	proxyReplaceLogStorage = storage.NewProxyLogStorage("./logs/proxy_replace")
}

// autoReplaceWorker 是后台运行的核心工作函数
func autoReplaceWorker(ctx context.Context) {
	log.Println("自动代理更换 Worker 已启动")
	// 立即执行一次，然后按计划执行
	executeAndLog()

	// 使用 Ticker 控制检测频率，例如每 30 分钟检测一次
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// 接收到停止信号
			log.Println("自动代理更换 Worker 已停止")
			return
		case <-ticker.C:
			executeAndLog()
		}
	}
}

func executeAndLog() {
	log.Println("开始执行新一轮的代理自动检测与更换...")

	autoReplaceTaskMutex.Lock()
	autoReplaceStatusMessage = "正在获取设备和代理列表..."
	autoReplaceTaskMutex.Unlock()

	// 1. 获取所有使用代理的设备和代理信息
	devicesByProxy, proxyInfos, err := getDevicesAndProxies()
	if err != nil {
		log.Printf("错误: 获取设备和代理失败: %v", err)
		autoReplaceTaskMutex.Lock()
		autoReplaceStatusMessage = fmt.Sprintf("错误: %v", err)
		autoReplaceTaskMutex.Unlock()
		return
	}

	if len(proxyInfos) == 0 {
		log.Println("没有找到正在被使用的代理，本轮检测结束。")
		autoReplaceTaskMutex.Lock()
		autoReplaceStatusMessage = "没有正在使用的代理，等待下一轮。"
		autoReplaceTaskMutex.Unlock()
		return
	}

	autoReplaceTaskMutex.Lock()
	autoReplaceStatusMessage = fmt.Sprintf("检测 %d 个代理中...", len(proxyInfos))
	autoReplaceTaskMutex.Unlock()

	// 2. 并发检测所有代理
	var proxyStatuses []ProxyStatus
	var wg sync.WaitGroup
	var mu sync.Mutex
	semaphore := make(chan struct{}, 50) // 限制并发

	for _, proxy := range proxyInfos {
		wg.Add(1)
		go func(p ProxyInfo) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			devices := devicesByProxy[p.ID]
			status := ProxyStatus{
				ProxyInfo:    p,
				UsingDevices: devices,
				DeviceCount:  len(devices),
				CheckTime:    time.Now(),
			}
			status.IsAvailable, status.ResponseTime, status.ErrorMessage, status.TestURL = checkProxyAvailabilityFast(p)

			mu.Lock()
			proxyStatuses = append(proxyStatuses, status)
			mu.Unlock()
		}(proxy)
	}
	wg.Wait()

	// 3. 筛选出不可用的代理
	var unavailableProxies []ProxyStatus
	for _, status := range proxyStatuses {
		if !status.IsAvailable {
			unavailableProxies = append(unavailableProxies, status)
		}
	}

	log.Printf("检测到 %d 个不可用代理", len(unavailableProxies))
	if len(unavailableProxies) == 0 {
		log.Println("所有代理均可用，本轮检测结束。")
		autoReplaceTaskMutex.Lock()
		autoReplaceStatusMessage = "所有代理均可用，等待下一轮。"
		autoReplaceTaskMutex.Unlock()
		return
	}

	autoReplaceTaskMutex.Lock()
	autoReplaceStatusMessage = fmt.Sprintf("检测到 %d 个不可用代理，正在更换...", len(unavailableProxies))
	autoReplaceTaskMutex.Unlock()

	// 4. 为每一个不可用的代理寻找并执行替换
	replaceUnavailableProxies(unavailableProxies)

	log.Println("本轮代理自动检测与更换完成")
	autoReplaceTaskMutex.Lock()
	autoReplaceStatusMessage = "更换完成，等待下一轮检测..."
	autoReplaceTaskMutex.Unlock()
}

// getDevicesAndProxies 封装了获取设备和代理信息的逻辑
func getDevicesAndProxies() (map[int64][]DeviceInfo, []ProxyInfo, error) {
	aiBoxDevices, err := getAIBoxDevicesWithProxy()
	if err != nil {
		return nil, nil, fmt.Errorf("获取AI盒子设备失败: %w", err)
	}

	cloudDevices, err := getCloudDevicesWithProxy()
	if err != nil {
		return nil, nil, fmt.Errorf("获取云设备失败: %w", err)
	}

	devicesByProxy := make(map[int64][]DeviceInfo)
	proxyIDs := make(map[int64]bool)

	for _, device := range aiBoxDevices {
		if device.ProxyID > 0 {
			devicesByProxy[device.ProxyID] = append(devicesByProxy[device.ProxyID], DeviceInfo{
				ID: device.ID, DevCode: device.DevCode, DevText: device.DevText, DeviceType: "ai_box", IsOnline: device.IsOnline, MerchantID: device.MerchantID,
			})
			proxyIDs[device.ProxyID] = true
		}
	}

	for _, device := range cloudDevices {
		if device.ProxyID > 0 {
			devicesByProxy[device.ProxyID] = append(devicesByProxy[device.ProxyID], DeviceInfo{
				ID: device.ID, DevCode: device.DevCode, DevText: device.DevText, DeviceType: "cloud", IsOnline: int8(device.IsOnline), MerchantID: device.MerchantID,
			})
			proxyIDs[device.ProxyID] = true
		}
	}

	var proxyInfos []ProxyInfo
	if len(proxyIDs) > 0 {
		var proxyIDList []int64
		for proxyID := range proxyIDs {
			proxyIDList = append(proxyIDList, proxyID)
		}
		err := db.G.Table("proxy").
			Where("id IN ? AND deleted_at IS NULL", proxyIDList).
			Scan(&proxyInfos).Error
		if err != nil {
			return nil, nil, fmt.Errorf("获取代理信息失败: %w", err)
		}
	}

	return devicesByProxy, proxyInfos, nil
}

// replaceUnavailableProxies 包含优化逻辑的替换函数
func replaceUnavailableProxies(unavailableProxies []ProxyStatus) {
	// 为每一个不可用的代理寻找并执行替换
	for _, failedProxy := range unavailableProxies {
		log.Printf("正在为代理 %d (IP: %s, 国家: %s) 寻找替代代理...",
			failedProxy.ProxyInfo.ID, failedProxy.ProxyInfo.IP, failedProxy.ProxyInfo.CountryCode)

		// 查找同merchant_id和country_code的可用代理
		replacement, found, err := findAvailableReplacement(
			failedProxy.ProxyInfo.MerchantID,
			failedProxy.ProxyInfo.ID,
			failedProxy.ProxyInfo.CountryCode,
		)

		if err != nil {
			log.Printf("错误: 查找替代代理失败: %v", err)
			LogProxyReplacement(
				int(failedProxy.ProxyInfo.ID), 0,
				int(failedProxy.ProxyInfo.MerchantID), 0,
				failedProxy.ProxyInfo.IP, failedProxy.ProxyInfo.Port,
				"", "",
				false, 0,
				"自动更换失败", fmt.Sprintf("查找替代代理失败: %v", err),
				"system", "auto",
			)
			continue
		}

		if !found {
			log.Printf("警告: 代理 %d 没有找到可用的替代代理 (相同merchant_id和country_code)", failedProxy.ProxyInfo.ID)
			LogProxyReplacement(
				int(failedProxy.ProxyInfo.ID), 0,
				int(failedProxy.ProxyInfo.MerchantID), 0,
				failedProxy.ProxyInfo.IP, failedProxy.ProxyInfo.Port,
				"", "",
				false, 0,
				"自动更换失败", "未找到相同merchant_id和country_code下的可用替代代理",
				"system", "auto",
			)
			continue
		}

		log.Printf("自动更换: 代理 %d (IP: %s) -> 新代理 %d (IP: %s)",
			failedProxy.ProxyInfo.ID, failedProxy.ProxyInfo.IP, replacement.ID, replacement.IP)

		// 获取使用失败代理的设备列表
		aiBoxDevices, cloudDevices, totalCount, err := getDevicesUsingProxy(failedProxy.ProxyInfo.ID)
		if err != nil {
			log.Printf("错误: 获取设备列表失败: %v", err)
			LogProxyReplacement(
				int(failedProxy.ProxyInfo.ID), int(replacement.ID),
				int(failedProxy.ProxyInfo.MerchantID), int(replacement.MerchantID),
				failedProxy.ProxyInfo.IP, failedProxy.ProxyInfo.Port,
				replacement.IP, replacement.Port,
				false, 0,
				"自动更换失败", fmt.Sprintf("获取设备列表失败: %v", err),
				"system", "auto",
			)
			continue
		}

		if totalCount == 0 {
			log.Printf("代理 %d 没有被任何设备使用，跳过更换", failedProxy.ProxyInfo.ID)
			LogProxyReplacement(
				int(failedProxy.ProxyInfo.ID), int(replacement.ID),
				int(failedProxy.ProxyInfo.MerchantID), int(replacement.MerchantID),
				failedProxy.ProxyInfo.IP, failedProxy.ProxyInfo.Port,
				replacement.IP, replacement.Port,
				true, 0,
				"自动更换成功（无设备使用）", "",
				"system", "auto",
			)
			continue
		}

		// 调用设置代理接口进行更换
		successCount, failureCount, err := callSetProxyAPI(aiBoxDevices, cloudDevices, replacement.ID)
		
		isSuccess := (err == nil && failureCount == 0)
		reason := "自动更换成功"
		errorMsg := ""
		
		if err != nil {
			reason = "自动更换失败"
			errorMsg = err.Error()
			log.Printf("错误: 调用设置代理接口失败: %v", err)
		} else if failureCount > 0 {
			reason = fmt.Sprintf("自动更换部分成功（成功%d，失败%d）", successCount, failureCount)
			log.Printf("警告: 代理更换部分失败，成功: %d，失败: %d", successCount, failureCount)
		} else {
			log.Printf("成功更换代理，影响 %d 个设备", successCount)
		}

		// 记录更换结果
		LogProxyReplacement(
			int(failedProxy.ProxyInfo.ID), int(replacement.ID),
			int(failedProxy.ProxyInfo.MerchantID), int(replacement.MerchantID),
			failedProxy.ProxyInfo.IP, failedProxy.ProxyInfo.Port,
			replacement.IP, replacement.Port,
			isSuccess, successCount,
			reason, errorMsg,
			"system", "auto",
		)
	}
}
