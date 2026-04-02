'use strict';
const fs   = require('fs');
const path = require('path');

// Allowed characters for app names: alphanumeric, hyphens, underscores, dots
const SAFE_APP_NAME = /^[a-zA-Z0-9._-]{1,64}$/;
// Date must be YYYY-MM-DD
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validate and sanitize an appName or date path segment.
 * Returns the sanitized value or throws a RangeError.
 */
function sanitizeAppName(value) {
  if (typeof value !== 'string' || !SAFE_APP_NAME.test(value)) {
    throw new RangeError(`Invalid appName: "${value}"`);
  }
  return value;
}

function sanitizeDate(value) {
  if (typeof value !== 'string' || !SAFE_DATE.test(value)) {
    throw new RangeError(`Invalid date: "${value}"`);
  }
  return value;
}

/**
 * Resolve a log file path and confirm it stays inside baseDir (path-traversal guard).
 */
function safeLogPath(baseDir, appName, date) {
  const sanitized = sanitizeAppName(appName);
  const safeDate  = sanitizeDate(date);
  const resolved  = path.resolve(baseDir, sanitized, `${safeDate}.log`);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
    throw new RangeError('Path traversal detected');
  }
  return resolved;
}

module.exports = { ensureDir, getToday, sanitizeAppName, sanitizeDate, safeLogPath };
