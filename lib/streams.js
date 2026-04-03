'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('./logger');
const { ensureDir } = require('./utils');

const activeStreams = new Map();

function getLogStream (appName, date) {
	const key = `${appName}\x00${date}`;
	if (activeStreams.has(key)) { return activeStreams.get(key); }
	const dir = path.join(config.LOG_BASE_DIR, appName);
	ensureDir(dir);
	const filePath = path.join(dir, `${date}.log`);
	const stream = fs.createWriteStream(filePath, { flags: 'a' });
	stream.on('error', (err) => { logger.error(`[Stream] ${filePath}: ${err.message}`); activeStreams.delete(key); });
	activeStreams.set(key, stream);
	return stream;
}

function closeAllStreams () { for (const s of activeStreams.values()) { s.end(); } activeStreams.clear(); }

module.exports = { getLogStream, closeAllStreams };
