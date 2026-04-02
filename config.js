'use strict';
const path = require('path');

// Load .env file if present (no hard dependency on dotenv — use node --env-file or install dotenv)
try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`[Config] Required environment variable ${name} is not set`);
  return val;
}

function envStr(name, fallback) {
  return process.env[name] || fallback;
}

function envInt(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (isNaN(n)) throw new Error(`[Config] ${name} must be an integer, got "${v}"`);
  return n;
}

function envBool(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  return v === 'true' || v === '1';
}

const JWT_SECRET = envStr('JWT_SECRET', '');
const API_KEY    = envStr('API_KEY', '');

if (process.env.NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET.length < 32)
    throw new Error('[Config] JWT_SECRET must be at least 32 characters in production');
  if (!API_KEY || API_KEY === 'replace-with-a-secure-api-key')
    throw new Error('[Config] API_KEY must be set to a real value in production');
}

module.exports = {
  NODE_ENV:          envStr('NODE_ENV', 'development'),
  PORT:              envInt('PORT', 9900),

  // Log storage
  LOG_BASE_DIR:      path.resolve(envStr('LOG_BASE_DIR', path.join(__dirname, 'logs'))),
  RETENTION_DAYS:    envInt('RETENTION_DAYS', 7),
  CLEANUP_INTERVAL:  envInt('CLEANUP_INTERVAL', 24 * 60 * 60 * 1000),

  // Batching
  BATCH_SIZE:        envInt('BATCH_SIZE', 20),
  BATCH_TIMEOUT:     envInt('BATCH_TIMEOUT', 200),

  // Security
  JWT_SECRET:        JWT_SECRET || 'dev-secret-change-in-production',
  SESSION_NAME:      envStr('SESSION_NAME', 'log_session'),
  API_KEY:           API_KEY   || 'change-me-secret-key',
  MAX_BODY_SIZE:     envStr('MAX_BODY_SIZE', '10mb'),

  // Features
  ENABLE_STREAM:     envBool('ENABLE_STREAM', true),

  // CORS
  CORS_ORIGINS:      envStr('CORS_ORIGINS', 'http://localhost:9900').split(',').map(s => s.trim()),

  // Users file
  USERS_FILE:        path.resolve(envStr('USERS_FILE', path.join(__dirname, 'users.json'))),
};
