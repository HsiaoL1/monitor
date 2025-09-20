package main

import (
	"control/go_server/db"
	"control/go_server/internal/models"
	"control/go_server/internal/storage"
	"fmt"
	"log"
	"os"
)

func main() {
	// Check if database path is provided
	dbPath := "./data/cicd.db"
	if len(os.Args) > 1 {
		dbPath = os.Args[1]
	}

	fmt.Printf("Initializing CI/CD SQLite database at: %s\n", dbPath)

	// Initialize SQLite database
	if err := db.InitCicdSQLite(dbPath); err != nil {
		log.Fatalf("Failed to initialize SQLite database: %v", err)
	}

	// Create CI/CD store and run migrations
	cicdStore := storage.NewCICDStore()
	if err := cicdStore.AutoMigrate(); err != nil {
		log.Fatalf("Failed to migrate CI/CD database: %v", err)
	}

	fmt.Println("✅ CI/CD database initialized successfully!")
	fmt.Println("Tables created:")
	fmt.Println("  - deployments")
	fmt.Println("  - service_environments")

	// Verify tables exist by checking if we can query them
	var tableCount int64
	if err := db.CicdDB.Raw("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").Scan(&tableCount).Error; err != nil {
		log.Printf("Warning: Could not verify table creation: %v", err)
	} else {
		fmt.Printf("✅ Verified: %d tables created in database\n", tableCount)
	}

	// Optional: Insert some test data
	if len(os.Args) > 2 && os.Args[2] == "--with-test-data" {
		fmt.Println("Inserting test data...")
		insertTestData(cicdStore)
	}
}

func insertTestData(store *storage.CICDStore) {
	// Insert a sample service environment
	testEnv := &models.ServiceEnvironment{
		ServiceName:    "ims_server_web",
		Environment:    models.EnvironmentTest,
		CurrentVersion: "v1.0.0",
		CurrentCommit:  "abc123",
		IsHealthy:      true,
		GitRepository:  "git@test-server:/opt/repos/ims_server_web-test.git",
	}

	if err := store.CreateOrUpdateServiceEnvironment(testEnv); err != nil {
		log.Printf("Warning: Failed to insert test data: %v", err)
	} else {
		fmt.Println("✅ Test data inserted successfully")
	}
}