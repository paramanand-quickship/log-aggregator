'use strict';
const ApiKeyService = require('../services/ApiKeyService');
const config        = require('../config');
const svc           = new ApiKeyService();

/**
 * validateApiKey(requiredScope?)
 * Supports: blq_... multi-keys (from api-keys.json, SHA-256 hashed)
 * Falls back to single legacy API_KEY env var for backward compat.
 * Attaches req.apiKey = { id, name, scopes[] } on success.
 */
function validateApiKey(requiredScope) {
  return async function(req, res, next) {
    const raw = req.headers['x-api-key'];
    if (!raw) return res.status(403).json({ error: 'X-Api-Key header required' });

    // Legacy fallback
    if (!raw.startsWith('blq_')) {
      if (raw !== config.API_KEY) return res.status(403).json({ error: 'Invalid API key' });
      req.apiKey = { id:'legacy', name:'legacy', scopes:['logs:write','logs:read'] };
      return next();
    }

    try {
      const key = await svc.validate(raw);
      if (!key) return res.status(403).json({ error: 'Invalid or expired API key' });
      if (requiredScope && !key.scopes.includes(requiredScope))
        return res.status(403).json({ error: 'Key missing scope: '+requiredScope });
      req.apiKey = key;
      next();
    } catch { res.status(500).json({ error: 'Key validation error' }); }
  };
}
module.exports = validateApiKey;
