'use strict';
const fs     = require('fs').promises;
const path   = require('path');
const config = require('../config');
const logger = require('./logger');

async function cleanupOldLogs() {
  logger.info('[Cleanup] Running log retention cleanup…');
  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() - config.RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let appDirs;
  try { appDirs = await fs.readdir(config.LOG_BASE_DIR); }
  catch (err) { if (err.code === 'ENOENT') return; throw err; }

  let deleted = 0;
  for (const app of appDirs) {
    const appPath = path.join(config.LOG_BASE_DIR, app);
    try {
      const stat = await fs.stat(appPath);
      if (!stat.isDirectory()) continue;
      const files = await fs.readdir(appPath);
      for (const file of files) {
        const m = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
        if (!m || m[1] >= cutoffStr) continue;
        try { await fs.unlink(path.join(appPath, file)); deleted++; logger.info(`[Cleanup] Deleted ${app}/${file}`); }
        catch (e) { logger.error(`[Cleanup] Failed to delete ${app}/${file}: ${e.message}`); }
      }
    } catch (err) { logger.warn(`[Cleanup] Skipping ${app}: ${err.message}`); }
  }
  logger.info(`[Cleanup] Done. Deleted ${deleted} file(s).`);
}

function scheduleCleanup() {
  cleanupOldLogs().catch(err => logger.error(`[Cleanup] Error: ${err.message}`));
  setInterval(() => cleanupOldLogs().catch(err => logger.error(`[Cleanup] Error: ${err.message}`)), config.CLEANUP_INTERVAL).unref();
}

module.exports = { scheduleCleanup, cleanupOldLogs };
