package api

import (
	"net/http"

	"control/go_server/config"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/sessions"
)

var store = sessions.NewCookieStore([]byte("a-very-strong-secret-key-that-should-be-in-env-vars"))

func init() {
	store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 days
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
}

// SessionsMiddleware creates a middleware for session management.
func SessionsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, _ := store.Get(c.Request, "connect.sid")
		c.Set("session", session)
		c.Next()
	}
}

// AuthMiddleware creates a middleware for authentication.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		session := c.MustGet("session").(*sessions.Session)
		if user, ok := session.Values["user"].(string); !ok || user == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		c.Next()
	}
}

// LoginHandler handles user login.
func LoginHandler(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request"})
		return
	}

	if req.Username == config.Conf.Login.Username && req.Password == config.Conf.Login.Password {
		session := c.MustGet("session").(*sessions.Session)
		session.Values["user"] = req.Username
		if err := session.Save(c.Request, c.Writer); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to save session"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "用户名或密码错误"})
	}
}

// LogoutHandler handles user logout.
func LogoutHandler(c *gin.Context) {
	session := c.MustGet("session").(*sessions.Session)
	session.Values["user"] = nil
	session.Options.MaxAge = -1 // Expire cookie
	if err := session.Save(c.Request, c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "登出失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// CheckAuthHandler checks the authentication status.
func CheckAuthHandler(c *gin.Context) {
	session := c.MustGet("session").(*sessions.Session)
	if user, ok := session.Values["user"].(string); ok && user != "" {
		c.JSON(http.StatusOK, gin.H{"isAuthenticated": true, "user": gin.H{"username": user}})
	} else {
		c.JSON(http.StatusOK, gin.H{"isAuthenticated": false})
	}
}
