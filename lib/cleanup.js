'use strict';
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('./logger');

async function cleanupOldLogs () {
	logger.info('[Cleanup] Running log cleanup…');
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - config.RETENTION_DAYS);
	const cutoffStr = cutoff.toISOString().slice(0, 10);

	let appDirs;
	try {
		appDirs = await fs.readdir(config.LOG_BASE_DIR);
	} catch (err) {
		if (err.code === 'ENOENT') { return; } // base dir doesn't exist yet — that's fine
		logger.error(`[Cleanup] Cannot read base dir: ${err.message}`);
		return;
	}

	for (const app of appDirs) {
		const appPath = path.join(config.LOG_BASE_DIR, app);
		try {
			const stat = await fs.stat(appPath);
			if (!stat.isDirectory()) { continue; }

			const files = await fs.readdir(appPath);
			for (const file of files) {
				const match = file.match(/^(\d{4}-\d{2}-\d{2})\.log$/);
				if (!match) { continue; }
				if (match[1] < cutoffStr) {
					const filePath = path.join(appPath, file);
					try {
						await fs.unlink(filePath);
						logger.info(`[Cleanup] Deleted ${filePath}`);
					} catch (e) {
						logger.error(`[Cleanup] Failed to delete ${filePath}: ${e.message}`);
					}
				}
			}
		} catch (err) {
			logger.warn(`[Cleanup] Skipping ${appPath}: ${err.message}`);
		}
	}
}

function scheduleCleanup () {
	cleanupOldLogs().catch((err) => logger.error(`[Cleanup] Error: ${err.message}`));
	setInterval(
		() => cleanupOldLogs().catch((err) => logger.error(`[Cleanup] Error: ${err.message}`)),
		config.CLEANUP_INTERVAL,
	).unref();
}

module.exports = { scheduleCleanup, cleanupOldLogs };
