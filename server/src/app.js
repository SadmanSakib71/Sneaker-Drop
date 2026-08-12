const express = require('express');
const dropRoutes = require('./routes/dropRoutes');

const app = express();

// Allow the Vite React app (and other configured origins) to call the API.
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

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

app.use('/api/drops', dropRoutes);

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
