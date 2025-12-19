package models

import "time"

// SocialAccount maps to the social_accounts table.
type SocialAccount struct {
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
	ExtraInfo       string    `gorm:"column:extra_info" json:"extra_info"`
	AppUniqueID     string    `gorm:"column:app_unique_id" json:"app_unique_id"`
	PlatformID      int64     `gorm:"column:platform_id" json:"platform_id"`
	OnlineStatus    int8      `gorm:"column:online_status" json:"online_status"`
}

func (SocialAccount) TableName() string {
	return "social_accounts"
}

// AiBoxDevice maps to the ai_box_device table.
type AiBoxDevice struct {
	ID      int `gorm:"column:id"`
	ProxyId int `gorm:"column:proxy_id"`
	DevCode string `gorm:"column:dev_code"`
}

func (AiBoxDevice) TableName() string { return "ai_box_device" }

// CloudDevice maps to the cloud_device table.
type CloudDevice struct {
	ID      int `gorm:"column:id"`
	ProxyId int `gorm:"column:proxy_id"`
	DevCode string `gorm:"column:dev_code"`
}

func (CloudDevice) TableName() string { return "cloud_device" }

// Proxy maps to the proxy table.
type Proxy struct {
	ID       int    `gorm:"column:id"`
	Ip       string `gorm:"column:ip"`
	Port     string `gorm:"column:port"`
	Account  string `gorm:"column:account"`
	Password string `gorm:"column:password"`
}

func (Proxy) TableName() string { return "proxy" }
