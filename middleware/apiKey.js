'use strict';
const config = require('../config');

function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== config.API_KEY) {
    return res.status(403).json({ error: 'Forbidden — invalid or missing API key' });
  }
  next();
}

module.exports = validateApiKey;
