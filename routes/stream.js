'use strict';
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const streamEmitter = require('../lib/emitter');
const config = require('../config');

if (config.ENABLE_STREAM) {
	// GET /logs/stream — real-time SSE
	router.get('/', authenticate, (req, res) => {
		/* ========================================================== */
		/* ================= SSE HEADERS ================= */
		/* ========================================================== */

		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('X-Accel-Buffering', 'no'); // 🔥 important for nginx
		res.flushHeaders();

		/* ========================================================== */
		/* ================= CONNECT EVENT ================= */
		/* ========================================================== */

		res.write('event: connected\n');
		res.write('data: {"status":"connected"}\n\n');

		/* ========================================================== */
		/* ================= SEND LOG ================= */
		/* ========================================================== */

		const sendLog = (log) => {
			try {
				// ensure valid single-line JSON
				let safeLog;

				if (typeof log === 'string') {
					try {
						safeLog = JSON.stringify(JSON.parse(log));
					} catch {
						safeLog = log.replace(/\n/g, ' ');
					}
				} else {
					safeLog = JSON.stringify(log);
				}

				res.write(`data: ${safeLog}\n\n`);
			} catch (err) {
				// never crash stream
				res.write('data: {"error":"log_stream_error"}\n\n');
			}
		};

		streamEmitter.on('log', sendLog);

		/* ========================================================== */
		/* ================= HEARTBEAT ================= */
		/* ========================================================== */

		const heartbeat = setInterval(() => {
			res.write(': ping\n\n');
		}, 15000); // 15s (better than 30s)

		/* ========================================================== */
		/* ================= CLEANUP ================= */
		/* ========================================================== */

		req.on('close', () => {
			streamEmitter.off('log', sendLog);
			clearInterval(heartbeat);
			res.end();
		});
	});
} else {
	router.get('/', (_req, res) =>
		res.status(404).json({ error: 'Stream endpoint is disabled' }),
	);
}

module.exports = router;