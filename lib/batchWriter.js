'use strict';
const { getLogStream } = require('./streams');
const logger           = require('./logger');
const config           = require('../config');

class BatchWriter {
  constructor() {
    // key → { appName, date, logs[] }
    this.buffer = new Map();
    this.timers = new Map();
  }

  write(appName, date, log) {
    const key = `${appName}\x00${date}`; // Use null-byte separator (safe – never in valid names)

    if (!this.buffer.has(key)) {
      this.buffer.set(key, { appName, date, logs: [] });
    }
    const entry = this.buffer.get(key);
    entry.logs.push(log);

    if (entry.logs.length >= config.BATCH_SIZE) {
      this._flushKey(key);
    } else if (!this.timers.has(key)) {
      const timer = setTimeout(() => this._flushKey(key), config.BATCH_TIMEOUT);
      this.timers.set(key, timer);
    }
  }

  _flushKey(key) {
    const timer = this.timers.get(key);
    if (timer) { clearTimeout(timer); this.timers.delete(key); }

    const entry = this.buffer.get(key);
    if (!entry || entry.logs.length === 0) return;
    this.buffer.delete(key);

    const { appName, date, logs } = entry;
    const stream = getLogStream(appName, date);
    for (const log of logs) {
      stream.write(log + '\n', (err) => {
        if (err) logger.error(`[BatchWriter] Write error (${appName}/${date}): ${err.message}`);
      });
    }
  }

  async flushAll() {
    const keys = Array.from(this.buffer.keys());
    for (const key of keys) this._flushKey(key);
  }
}

module.exports = BatchWriter;
