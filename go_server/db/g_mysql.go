package db

import (
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

var G *gorm.DB

func InitGMySQL(dbconn string) error {
	db, err := gorm.Open(mysql.Open(dbconn), &gorm.Config{})
	if err != nil {
		return err
	}
	// get deep db
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxIdleConns(15)
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetConnMaxLifetime(300 * time.Second)

	G = db
	return nil
}
