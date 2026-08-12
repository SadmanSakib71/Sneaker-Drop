const express = require('express');

const app = express();

app.use(express.json());

/**
 * Health check — confirms the API process is running.
 * DB connectivity is verified at startup in server.js.
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'SneakerDrop API is running',
    timestamp: new Date().toISOString(),
  });
});

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
  });
});

module.exports = app;
