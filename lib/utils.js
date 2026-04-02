'use strict';
const fs   = require('fs');
const path = require('path');

const SAFE_APP  = /^[a-zA-Z0-9._-]{1,64}$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function getToday() { return new Date().toISOString().slice(0, 10); }

function sanitizeAppName(v) {
  if (typeof v !== 'string' || !SAFE_APP.test(v)) throw new RangeError(`Invalid appName: "${v}"`);
  return v;
}
function sanitizeDate(v) {
  if (typeof v !== 'string' || !SAFE_DATE.test(v)) throw new RangeError(`Invalid date: "${v}"`);
  return v;
}
function safeLogPath(baseDir, appName, date) {
  const app      = sanitizeAppName(appName);
  const d        = sanitizeDate(date);
  const resolved = path.resolve(baseDir, app, `${d}.log`);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) throw new RangeError('Path traversal detected');
  return resolved;
}

/** Format bytes to human-readable string */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

module.exports = { ensureDir, getToday, sanitizeAppName, sanitizeDate, safeLogPath, formatBytes };
