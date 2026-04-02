'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log(level, message) {
  if (LEVELS[level] > currentLevel) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message });
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

module.exports = {
  error: (msg) => log('error', msg),
  warn:  (msg) => log('warn',  msg),
  info:  (msg) => log('info',  msg),
  debug: (msg) => log('debug', msg),
};
