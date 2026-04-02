'use strict';
const express = require('express');
const router = express.Router();
const config = require('../config');
const validateApiKey = require('../middleware/apiKey');
const rateLimit = require('../middleware/rateLimit');
const streamEmitter = require('../lib/emitter');
const { getToday, sanitizeAppName } = require('../lib/utils');
const logger = require('../lib/logger');

let batchWriter;

function setBatchWriter (bw) { batchWriter = bw; }

// Allow up to 1000 log batches/min per IP before throttling
const ingestLimiter = rateLimit({ windowMs: 60_000, max: 1000, message: 'Ingest rate limit exceeded' });

// POST /logs
router.post('/', validateApiKey, ingestLimiter, (req, res) => {
	try {
		const { logs, appName: bodyAppName } = req.body;

		if (!Array.isArray(logs)) {
			return res.status(400).json({ error: '"logs" must be an array of strings' });
		}
		if (logs.length === 0) {
			return res.status(400).json({ error: '"logs" array must not be empty' });
		}
		if (logs.length > 10_000) {
			return res.status(400).json({ error: 'Too many log entries in a single request (max 10 000)' });
		}

		const today = getToday();
		let written = 0;

		for (let i = 0; i < logs.length; i++) {
			const logStr = logs[i];

			if (typeof logStr !== 'string') {
				return res.status(400).json({ error: `logs[${i}] must be a string` });
			}
			if (logStr.length > 64_000) {
				return res.status(400).json({ error: `logs[${i}] exceeds 64 KB limit` });
			}

			// resolve appName
			let appName = bodyAppName || 'unknown';

			try {
				const parsed = JSON.parse(logStr);
				if (parsed && typeof parsed.appName === 'string') {
					appName = parsed.appName;
				}
			} catch (_) {}

			try {
				appName = sanitizeAppName(appName);
			} catch (_) {
				appName = 'unknown';
			}

			// write log to file
			batchWriter.write(appName, today, logStr);

			/* ========================================================== */
			/* ================= FIX START ================= */
			/* ========================================================== */

			if (config.ENABLE_STREAM) {
				try {
					// ensure SSE safe (single line JSON)
					const parsed = JSON.parse(logStr);
					streamEmitter.emit('log', JSON.stringify(parsed));
				} catch {
					streamEmitter.emit('log', logStr.replace(/\n/g, ' '));
				}
			}

			/* ================= FIX END ================= */

			written++;
		}

		res.status(202).json({ received: written });
	} catch (err) {
		logger.error(`[Ingest] Error: ${err.message}`);
		res.status(500).json({ error: 'Internal server error' });
	}
});

module.exports = { router, setBatchWriter };