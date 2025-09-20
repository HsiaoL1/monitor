package db

import (
	"os"
	"path/filepath"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	_ "modernc.org/sqlite" // Pure Go SQLite driver
)

// CicdDB is the SQLite database connection for CI/CD functionality
var CicdDB *gorm.DB

// InitCicdSQLite initializes SQLite database connection for CI/CD data
func InitCicdSQLite(dbPath string) error {
	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	db, err := gorm.Open(sqlite.Open(dbPath+"?_pragma=foreign_keys(1)"), &gorm.Config{})
	if err != nil {
		return err
	}

	// Configure connection pool for SQLite
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxIdleConns(5)  // SQLite doesn't need many connections
	sqlDB.SetMaxOpenConns(10) // SQLite is file-based
	sqlDB.SetConnMaxLifetime(300 * time.Second)

	CicdDB = db
	return nil
}
