package api

import (
	"control/go_server/internal/utils"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"

	"github.com/gin-gonic/gin"
)

// PprofFlamegraphHandler generates and returns a flamegraph for a service.
func PprofFlamegraphHandler(c *gin.Context) {
	serviceName := c.Param("serviceName")
	profile := c.DefaultQuery("profile", "profile")

	service, found := utils.FindServiceByName(serviceName)
	if !found || service.PprofURL == "" {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Service not found or pprof not configured"})
		return
	}

	pprofURL := fmt.Sprintf("%s%s?seconds=30", service.PprofURL, profile)

	// Fetch pprof data
	resp, err := http.Get(pprofURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch pprof data", "message": err.Error()})
		return
	}
	defer resp.Body.Close()

	pprofData, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to read pprof data", "message": err.Error()})
		return
	}

	// Save to temp file
	tmpfile, err := os.CreateTemp("", fmt.Sprintf("%s_%s_*.pprof", serviceName, profile))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create temp file", "message": err.Error()})
		return
	}
	defer os.Remove(tmpfile.Name())
	tmpfile.Write(pprofData)
	tmpfile.Close()

	// Generate SVG
	cmd := exec.Command("go", "tool", "pprof", "-svg", tmpfile.Name())
	svgContent, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate flamegraph", "message": err.Error()})
		return
	}

	// Return as HTML
	htmlContent := `
<!DOCTYPE html>
<html>
<head>
    <title>` + serviceName + ` - ` + profile + ` Flamegraph</title>
    <meta charset="utf-8">
    <style>body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: auto; } svg { width: 100%; }</style>
</head>
<body>` + string(svgContent) + `</body>
</html>`

	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(htmlContent))
}
