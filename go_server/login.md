```go
// WebTask represents the structure of a task in the queue
type WebTask struct {
	ID          int64  `json:"id"`
	Type        string `json:"type"`
	PhoneNumber string `json:"phone_number"`
	Timezone    string `json:"timezone"`
	Language    string `json:"language"`
	Proxy       string `json:"proxy"`
}

// QueueLoginTaskRequest defines the request body for queueing a login task
type QueueLoginTaskRequest struct {
	ID    int64  `json:"id"`
	Token string `json:"token"`
}

// WebEndpointUseController handles the web endpoint tasks.
type WebEndpointUseController struct {
	web.Controller
}

// QueueLoginTask handles POST /api/v1/queueLoginTask
func (c *WebEndpointUseController) QueueLoginTask() {
	var req QueueLoginTaskRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
		c.Ctx.Output.SetStatus(http.StatusBadRequest)
		c.Data["json"] = controllers.Response(http.StatusBadRequest, "invalid request body", nil)
		return
	}

	confToken, err := config.String("web_task_token")
	if err != nil || confToken == "" {
		logs.Error("web_task_token not configured")
		c.Ctx.Output.SetStatus(http.StatusInternalServerError)
		c.Data["json"] = controllers.Response(http.StatusInternalServerError, "server configuration error", nil)
		return
	}

	if req.Token != confToken {
		c.Ctx.Output.SetStatus(http.StatusUnauthorized)
		c.Data["json"] = controllers.Response(http.StatusUnauthorized, "invalid token", nil)
		return
	}

	if req.ID == 0 {
		c.Ctx.Output.SetStatus(http.StatusBadRequest)
		c.Data["json"] = controllers.Response(http.StatusBadRequest, "account_id is required", nil)
		return
	}

	var acc socialAccountModels.SocialAccount
	err = db.O.QueryTable(&socialAccountModels.SocialAccount{}).Filter("id", req.ID).One(&acc)
	if err != nil {
		logs.Error("Failed to query for account ID %d: %v", req.ID, err)
		c.Ctx.Output.SetStatus(http.StatusNotFound)
		c.Data["json"] = controllers.Response(http.StatusNotFound, "account not found", nil)
		return
	}

	if err := queueLoginTask(acc); err != nil {
		logs.Error("Failed to queue login task for account %s (ID: %d): %v", acc.Account, acc.Id, err)
		c.Ctx.Output.SetStatus(http.StatusInternalServerError)
		c.Data["json"] = controllers.Response(http.StatusInternalServerError, "failed to queue task", nil)
		return
	}

	c.Data["json"] = controllers.Response(0, "success", nil)
}

func queueLoginTask(acc socialAccountModels.SocialAccount) error {
	proxyString, err := getProxyString(acc.DeviceType, acc.DevCode)
	if err != nil {
		logs.Warn("Failed to get proxy for account %s: %v", acc.Account, err)
		// Not returning error, as proxy is optional
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
			logs.Warn("Failed to unmarshal extra_info for account %s: %v", acc.Account, err)
		}
	}

	task := WebTask{
		ID:          int64(acc.Id),
		Type:        "pairing_code",
		PhoneNumber: acc.Account,
		Timezone:    timezone,
		Language:    language,
		Proxy:       proxyString,
	}

	taskJSON, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("failed to marshal task for account %s: %v", acc.Account, err)
	}

	// Using the same clientID as in the original cron job
	clientID := getClientID()
	queueName := WebTaskQueuePrefix + clientID

	if err := db.RC.RPush(context.Background(), queueName, taskJSON).Err(); err != nil {
		return fmt.Errorf("failed to push task to redis queue '%s' for account %s: %v", queueName, acc.Account, err)
	}

	logs.Info("Successfully pushed link code login task for account %s to queue %s", acc.Account, queueName)
	return nil
}

// 这里需要一个获取clientID的函数
func getClientID() string {
	// TODO: implement logic to get client ID if needed
	// For now, return a static value
	return "web01"
}

func getProxyString(deviceType int, devCode string) (string, error) {
	var proxyID int
	var err error

	if devCode == "" {
		return "", fmt.Errorf("dev_code is empty")
	}

	switch deviceType {
	case 1: // ai_box_device
		var aiBoxDevice device.AiBoxDevice
		err = db.O.QueryTable(&device.AiBoxDevice{}).Filter("dev_code", devCode).One(&aiBoxDevice, "proxy_id")
		if err != nil {
			if err == orm.ErrNoRows {
				return "", nil
			}
			return "", fmt.Errorf("failed to find ai_box_device with dev_code %s: %v", devCode, err)
		}
		proxyID = aiBoxDevice.ProxyId
	case 2: // cloud_device
		var cloudDevice device.CloudDevice
		err = db.O.QueryTable(&device.CloudDevice{}).Filter("dev_code", devCode).One(&cloudDevice, "proxy_id")
		if err != nil {
			if err == orm.ErrNoRows {
				return "", nil
			}
			return "", fmt.Errorf("failed to find cloud_device with dev_code %s: %v", devCode, err)
		}
		proxyID = cloudDevice.ProxyId
	default:
		return "", fmt.Errorf("unsupported device_type: %d", deviceType)
	}

	if proxyID == 0 {
		// No proxy associated, return empty string, no error
		return "", nil
	}

	var proxy device.Proxy
	err = db.O.QueryTable(&device.Proxy{}).Filter("id", proxyID).One(&proxy)
	if err != nil {
		if err == orm.ErrNoRows {
			// Proxy ID exists but proxy record not found. Maybe warn.
			logs.Warn("proxy with id %d not found, though it is referenced by dev_code %s", proxyID, devCode)
			return "", nil
		}
		return "", fmt.Errorf("failed to find proxy with id %d: %v", proxyID, err)
	}

	if proxy.Ip == "" || proxy.Port == "" {
		return "", nil // No proxy configured for this device, which is a valid case.
	}

	if proxy.Account != "" && proxy.Password != "" {
		return fmt.Sprintf("%s:%s@%s:%s", proxy.Account, proxy.Password, proxy.Ip, proxy.Port), nil
	}

	return fmt.Sprintf("%s:%s", proxy.Ip, proxy.Port), nil
}
```
