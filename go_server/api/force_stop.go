package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

var httpClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

type Launch struct {
	DeviceId   string `json:"device_id"`
	DeviceType int    `json:"device_type"`
	Pkg        string `json:"pkg"`
}
type Stop struct {
	DeviceId   string `json:"device_id"`
	DeviceType int    `json:"device_type"`
	Pkg        string `json:"pkg"`
}

// 拉起 whatsapp 到最前， 登录前

func LaunchApp(devCode string, devType int, pkg string) (err error) {

	url := "http://127.0.0.1:8090/api/v1/social_account/launch"
	reqData := Launch{
		DeviceId:   devCode,
		DeviceType: devType,
		Pkg:        pkg,
	}
	jsonData, _ := json.Marshal(reqData)
	// slog.Info("Launch request body: %v", string(jsonData))
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")

	client := httpClient
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	// slog.Info("Response Status: %v", resp.Status)

	if resp.StatusCode == 200 {
		var result struct {
			Code int    `json:"code"`
			Data any    `json:"data"`
			Msg  string `json:"msg"`
		}
		if err = json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return
		}

		if result.Code == 200 && result.Msg == "success" {
			slog.Info("launch app 成功")
			return
		} else {
			return
		}
	}

	return
}

// kill whatsapp

func ForceStop(devCode string, devType int, pkg string) (err error) {

	url := "http://127.0.0.1:8090/api/v1/social_account/force_stop"
	reqData := Stop{
		DeviceId:   devCode,
		DeviceType: devType,
		Pkg:        pkg,
	}
	jsonData, _ := json.Marshal(reqData)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")

	client := httpClient
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	// slog.Info("Response Status: %v", resp.Status)

	if resp.StatusCode == 200 {
		var result struct {
			Code int    `json:"code"`
			Data any    `json:"data"`
			Msg  string `json:"msg"`
		}
		if err = json.NewDecoder(resp.Body).Decode(&result); err != nil {
			fmt.Println("Error decoding response body:", err)
			return
		}

		if result.Code == 200 && result.Msg == "success" {
			slog.Info("kill whatsapp")
			return
		} else {
			fmt.Printf("kill whatsapp 失败: %s\n", result.Msg)
			return
		}
	}

	return
}

// 判断百度云
func isValidBaiduYun(s string) bool {
	if len(s) == 0 || s[0] != 'V' {
		return false
	}
	for i := 1; i < len(s); i++ {
		char := s[i]
		if !((char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '_') {
			return false
		}
	}
	return true
}

// 判断是否云机
func isValidBoxYun(s string) bool {
	for i := 0; i < len(s); i++ {
		char := s[i]
		if !((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '_') {
			return false
		}
	}
	return true
}
