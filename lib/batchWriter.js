'use strict';
const { getLogStream } = require('./streams');
const logger = require('./logger');
const config = require('../config');

class BatchWriter {
	constructor () {
		this.buffer = new Map(); // key → { appName, date, logs[] }
		this.timers = new Map();
	}

	write (appName, date, log) {
		const key = `${appName}\x00${date}`;
		if (!this.buffer.has(key)) {
			this.buffer.set(key, { appName, date, logs: [] });
		}
		const entry = this.buffer.get(key);
		entry.logs.push(log);
		if (entry.logs.length >= config.BATCH_SIZE) {
			this._flushKey(key);
		} else if (!this.timers.has(key)) {
			this.timers.set(
				key,
				setTimeout(() => this._flushKey(key), config.BATCH_TIMEOUT),
			);
		}
	}

	_flushKey (key) {
		const timer = this.timers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(key);
		}
		const entry = this.buffer.get(key);
		if (!entry || !entry.logs.length) {
			return;
		}
		this.buffer.delete(key);
		const { appName, date, logs } = entry;
		const stream = getLogStream(appName, date);
		for (const log of logs) {
			stream.write(`${log}\n`, (err) => {
				if (err) {
					logger.error(`[BatchWriter] ${appName}/${date}: ${err.message}`);
				}
			});
		}
	}

	async flushAll () {
		for (const key of this.buffer.keys()) {
			this._flushKey(key);
		}
	}
}

module.exports = BatchWriter;
