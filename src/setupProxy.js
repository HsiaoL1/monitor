const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:9112',
      changeOrigin: true,
      timeout: 30000,
      onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
        res.status(500).json({ 
          error: 'Backend server is not available',
          message: 'Please make sure the backend server is running on port 3001'
        });
      }
    })
  );
};