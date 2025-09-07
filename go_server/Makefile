build:
	@rm -rf agent_server
	@echo "Building the Go server..."
	@go build -o agent_server ./cmd/server/main.go

rb:
	@echo "build for linux"
	@rm -f agent_server
	@CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o agent_server ./cmd/server/main.go

si:
	@scp agent_server root@119.8.54.133:/opt/ims_server_monitor
