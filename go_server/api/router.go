package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// SetupRouter initializes the Gin router and sets up all the routes.
func SetupRouter() *gin.Engine {
	router := gin.Default()

	// CORS middleware
	router.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return true
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Session middleware
	router.Use(SessionsMiddleware())

	// API Routes
	api := router.Group("/api")
	{
		// Public routes
		api.POST("/login", LoginHandler)
		api.POST("/logout", LogoutHandler)
		api.GET("/check-auth", CheckAuthHandler)
		api.GET("/health", HealthCheckHandler)
		api.GET("/online-cloud-accounts", GetOnlineCloudAccountsHandler)

		// Authenticated routes
		auth := api.Group("/")
		auth.Use(AuthMiddleware())
		{
			auth.GET("/system-metrics", SystemMetricsHandler)
			auth.GET("/system-metrics/history", SystemMetricsHistoryHandler)
			auth.GET("/system-metrics/stats", MetricsStatsHandler)
			auth.GET("/service-status", ServiceStatusHandler)
			auth.GET("/services-status", ServicesStatusHandler)
			auth.POST("/service/start", ServiceStartHandler)
			auth.POST("/service/stop", ServiceStopHandler)
			auth.POST("/service/restart", ServiceRestartHandler)
			auth.GET("/logs/:serviceName", LogsHandler)
			auth.GET("system/info", SystemInfoHandler)
			auth.POST("/terminal/execute", ExecuteCommandHandler)
			auth.GET("/device-monitoring", GetDeviceMonitoringHandler)

			// Redis routes
			redisGroup := auth.Group("/redis")
			{
				redisGroup.GET("/stale-users", GetStaleUsersHandler)
				redisGroup.POST("/cleanup-stale-users", CleanupStaleUsersHandler)
			}

			// Account status monitoring routes
			accountGroup := auth.Group("/account")
			{
				accountGroup.GET("/status-mismatch", GetAccountMismatchHandler)
				accountGroup.POST("/sync-status", SyncAccountStatusHandler)
				accountGroup.GET("/sync-log", GetAccountSyncLogHandler)
				accountGroup.GET("/sync-log/download", DownloadAccountSyncLogHandler)
			}

			// Proxy monitoring routes
			proxyGroup := auth.Group("/proxy")
			{
				proxyGroup.GET("/status", GetProxyStatusHandler)
				proxyGroup.POST("/find-replacement", FindReplacementProxyHandler)
				proxyGroup.POST("/replace", ReplaceProxyHandler)
				proxyGroup.POST("/notify", NotifyMerchantHandler)
				proxyGroup.GET("/replace-log", GetProxyReplaceLogHandler)
				proxyGroup.GET("/replace-log/download", DownloadReplaceLogHandler)
				proxyGroup.POST("/check-async", StartAsyncProxyCheckHandler)
				proxyGroup.GET("/check-status/:taskId", GetAsyncCheckStatusHandler)

				// Auto-replace routes
				autoReplaceGroup := proxyGroup.Group("/auto-replace")
				{
					autoReplaceGroup.POST("/start", StartAutoReplaceHandler)
					autoReplaceGroup.POST("/stop", StopAutoReplaceHandler)
					autoReplaceGroup.GET("/status", GetAutoReplaceStatusHandler)
				}
			}

			// Pprof routes
			auth.GET("/pprof/:serviceName/flamegraph", PprofFlamegraphHandler)
		}
	}

	// Static file serving
	router.Use(staticFileServer("../build"))
	router.NoRoute(func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/api") {
			c.File(filepath.Join("../build", "index.html"))
		} else {
			c.JSON(http.StatusNotFound, gin.H{"error": "API not found"})
		}
	})

	return router
}

func staticFileServer(fsRoot string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api") || c.Request.Method != http.MethodGet {
			c.Next()
			return
	}

		filePath := filepath.Join(fsRoot, c.Request.URL.Path)

		if info, err := os.Stat(filePath); err == nil && info.IsDir() {
			filePath = filepath.Join(filePath, "index.html")
		}

		if _, err := os.Stat(filePath); err == nil {
			c.File(filePath)
			c.Abort()
			return
		}

		c.Next()
	}
}
