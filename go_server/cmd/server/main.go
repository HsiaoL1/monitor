package main

import (
	"bufio"
	"control/go_server/api"
	"control/go_server/config"
	"control/go_server/db"
	"fmt"
	"os"
	"strings"
)

func getSqlConnFromConf() (string, error) {
	file, err := os.Open("./conf/app.conf")
	if err != nil {
		return "", err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "sqlconn") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1]), nil
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return "", err
	}

	return "", fmt.Errorf("sqlconn not found in app.conf")
}

func main() {
	// Load configurations from the relative path to the project root
	if err := config.LoadConfig("./config.json"); err != nil {
		fmt.Println("Error loading configurations:", err)
		os.Exit(1)
	}

	// Get DB connection string
	sqlconn, err := getSqlConnFromConf()
	if err != nil {
		fmt.Println("Error getting db connection string:", err)
		os.Exit(1)
	}

	// Initialize database
	if err := db.InitGMySQL(sqlconn); err != nil {
		fmt.Println("Error initializing database:", err)
		os.Exit(1)
	}

	// Setup router
	router := api.SetupRouter()

	// Start server
	fmt.Println("Go server running on port 9112")
	if err := router.Run(":9112"); err != nil {
		fmt.Println("Error starting server:", err)
		os.Exit(1)
	}
}
