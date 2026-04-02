'use strict';
const config = require('../config');

function validateApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== config.API_KEY) return res.status(403).json({ error: 'Forbidden — invalid or missing API key' });
  next();
}

module.exports = validateApiKey;
