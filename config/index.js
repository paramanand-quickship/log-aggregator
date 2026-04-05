'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch (_) {}

function str(n, f)  { return process.env[n] || f; }
function int(n, f)  { const v = process.env[n]; if (!v) return f; const i = parseInt(v,10); if (isNaN(i)) throw new Error('[Config] '+n+' must be integer'); return i; }
function bool(n, f) { const v = process.env[n]; if (!v) return f; return v === 'true' || v === '1'; }

const JWT_SECRET = str('JWT_SECRET', '');
const NODE_ENV   = str('NODE_ENV', 'development');

if (NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('[Config] JWT_SECRET must be ≥32 chars in production');
}

// All data files live in DATA_DIR (defaults to ./data — easy to volume-mount in Docker)
const DATA_DIR = path.resolve(str('DATA_DIR', path.join(ROOT, 'data')));

module.exports = {
  NODE_ENV,
  PORT:              int('PORT', 9900),
  LOG_BASE_DIR:      path.resolve(str('LOG_BASE_DIR', path.join(ROOT, 'logs'))),
  DATA_DIR,
  RETENTION_DAYS:    int('RETENTION_DAYS', 7),
  CLEANUP_INTERVAL:  int('CLEANUP_INTERVAL', 86400000),
  BATCH_SIZE:        int('BATCH_SIZE', 20),
  BATCH_TIMEOUT:     int('BATCH_TIMEOUT', 200),
  JWT_SECRET:        JWT_SECRET || 'dev-secret-change-in-production',
  JWT_EXPIRES_IN:    str('JWT_EXPIRES_IN', '24h'),
  SESSION_NAME:      str('SESSION_NAME', 'blorq_session'),
  MAX_BODY_SIZE:     str('MAX_BODY_SIZE', '10mb'),
  ENABLE_STREAM:     bool('ENABLE_STREAM', true),
  CORS_ORIGINS:      str('CORS_ORIGINS', 'http://localhost:9900').split(',').map(s=>s.trim()),
  WEBHOOK_URL:       str('WEBHOOK_URL', ''),
  // Data file paths
  USERS_FILE:    path.join(DATA_DIR, str('USERS_FILE',    'users.json')),
  SETTINGS_FILE: path.join(DATA_DIR, str('SETTINGS_FILE', 'settings.json')),
  ROLES_FILE:    path.join(DATA_DIR, str('ROLES_FILE',    'role-config.json')),
  API_KEYS_FILE: path.join(DATA_DIR, str('API_KEYS_FILE', 'api-keys.json')),
  // Legacy single API_KEY for backward compat
  API_KEY:       str('API_KEY', 'change-me-secret-key'),
};
