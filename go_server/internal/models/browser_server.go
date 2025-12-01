package models

import (
	"gorm.io/gorm"
	"time"
)

// BrowserServer defines a manageable browser server instance
type BrowserServer struct {
	ID              int64          `gorm:"primaryKey" json:"id"`
	Name            string         `gorm:"unique;not null;size:191" json:"name"`
	MaxBrowserCount int            `gorm:"column:max_browser_count;not null" json:"max_browser_count"`
	IsEnabled       bool           `gorm:"column:is_enabled;not null;default:true" json:"is_enabled"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

func (BrowserServer) TableName() string {
	return "browser_servers"
}
