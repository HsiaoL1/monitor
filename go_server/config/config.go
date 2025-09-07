package config

import (
	"control/go_server/internal/models"
	"encoding/json"
	"os"
)

// AppConfig holds the application configuration
type AppConfig struct {
	Login    models.LoginCredentials
	Services []models.Service
	Redis    RedisConfig
}

// RedisConfig for connecting to Redis
type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
}

// Conf is the global configuration variable
var Conf AppConfig

// LoadConfig initializes the application configuration
func LoadConfig(loginPath string) error {
	// Load login credentials
	file, err := os.ReadFile(loginPath)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(file, &Conf.Login); err != nil {
		return err
	}

	// Initialize services
	Conf.Services = []models.Service{
		{Name: "ims_agent_api", Path: "/opt/ims_agent_api", DeployScript: "./deploy.sh"},
		{Name: "ims_server_api", Path: "/opt/ims_server_api", DeployScript: "./deploy.sh"},
		{Name: "ims_server_active", Path: "/opt/ims_server_active", DeployScript: "./deploy.sh"},
		{Name: "ims_server_send", Path: "/opt/ims_server_send/cmd/ims_server_send", DeployScript: "./deploy.sh"},
		{Name: "ims_server_task", Path: "/opt/ims_server_task/cmd/ims_server_task", DeployScript: "./deploy.sh"},
		{Name: "ims_server_web", Path: "/opt/ims_server_web/cmd/server", DeployScript: "./deploy.sh", PprofURL: "http://119.8.54.133:9090/debug/pprof/"},
		{Name: "ims_server_ws", Path: "/opt/ims_server_ws/cmd/server", DeployScript: "./deploy.sh", PprofURL: "http://119.8.54.133:9000/debug/pprof/"},
		{Name: "ims_server_mq", Path: "/opt/ims_server_mq/cmd/mq", DeployScript: "./deploy.sh", PprofURL: "http://119.8.54.133:9002/debug/pprof/"},
	}

	// Initialize Redis config
	Conf.Redis = RedisConfig{
		Host:     "127.0.0.1",
		Port:     6379,
		Password: "smmtk@9988",
		DB:       0,
	}

	return nil
}
