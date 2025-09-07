package models

// LoginCredentials matches the structure of config.json
type LoginCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Service defines a manageable service
type Service struct {
	Name         string `json:"serviceName"`
	Path         string `json:"servicePath"`
	DeployScript string `json:"deployScript"`
	PprofURL     string `json:"pprofUrl,omitempty"`
}
