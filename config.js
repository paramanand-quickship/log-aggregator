'use strict';
const path = require('path');
try { require('dotenv').config(); } catch (_) {}

function envStr(n, f) { return process.env[n] || f; }
function envInt(n, f) {
  const v = process.env[n]; if (!v) return f;
  const i = parseInt(v, 10); if (isNaN(i)) throw new Error(`[Config] ${n} must be integer`);
  return i;
}
function envBool(n, f) { const v = process.env[n]; if (!v) return f; return v === 'true' || v === '1'; }

const JWT_SECRET = envStr('JWT_SECRET', '');
const API_KEY    = envStr('API_KEY', '');

if (process.env.NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('[Config] JWT_SECRET must be ≥32 chars in production');
  if (!API_KEY || API_KEY === 'change-me-secret-key') throw new Error('[Config] Set a real API_KEY in production');
}

module.exports = {
  NODE_ENV:          envStr('NODE_ENV', 'development'),
  PORT:              envInt('PORT', 9900),
  LOG_BASE_DIR:      path.resolve(envStr('LOG_BASE_DIR', path.join(__dirname, 'logs'))),
  RETENTION_DAYS:    envInt('RETENTION_DAYS', 7),
  CLEANUP_INTERVAL:  envInt('CLEANUP_INTERVAL', 24 * 60 * 60 * 1000),
  BATCH_SIZE:        envInt('BATCH_SIZE', 20),
  BATCH_TIMEOUT:     envInt('BATCH_TIMEOUT', 200),
  JWT_SECRET:        JWT_SECRET || 'dev-secret-change-in-production',
  SESSION_NAME:      envStr('SESSION_NAME', 'log_session'),
  API_KEY:           API_KEY || 'change-me-secret-key',
  MAX_BODY_SIZE:     envStr('MAX_BODY_SIZE', '10mb'),
  ENABLE_STREAM:     envBool('ENABLE_STREAM', true),
  CORS_ORIGINS:      envStr('CORS_ORIGINS', 'http://localhost:9900').split(',').map(s => s.trim()),
  USERS_FILE:        path.resolve(envStr('USERS_FILE',    path.join(__dirname, 'users.json'))),
  SETTINGS_FILE:     path.resolve(envStr('SETTINGS_FILE', path.join(__dirname, 'settings.json'))),
  WEBHOOK_URL:       envStr('WEBHOOK_URL', ''),
};
