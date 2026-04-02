'use strict';
const express = require('express');
const router  = express.Router();

const startTime = Date.now();

// GET /health
router.get('/', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor((Date.now() - startTime) / 1000),  // seconds
    memory: {
      rss:      `${Math.round(mem.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
      heapTotal:`${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
    },
    node:      process.version,
  });
});

module.exports = router;
