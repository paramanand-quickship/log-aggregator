'use strict';
const express = require('express');
const fs = require('fs');
const fsP = require('fs').promises;
const path = require('path');
const authenticate = require('../middleware/auth');
const config = require('../config');
const { cleanupOldLogs } = require('../lib/cleanup');

const router = express.Router();
const SETTINGS_FILE = path.join(__dirname, '../settings.json');

// Helper for retention
function loadRetention () {
	try {
		const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
		return JSON.parse(data).retentionDays || 7;
	} catch (e) { return 7; }
}

function saveRetention (days) {
	fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ retentionDays: days }));
}

// GET /stats - real implementation
router.get('/', authenticate, async (req, res) => {
	try {
		let appDirs = [];
		try { appDirs = await fsP.readdir(config.LOG_BASE_DIR); } catch (e) { if (e.code !== 'ENOENT') { throw e; } }

		let totalBytes = 0;
		const apps = [];

		for (const app of appDirs) {
			const appPath = path.join(config.LOG_BASE_DIR, app);
			try {
				const stat = await fsP.stat(appPath);
				if (!stat.isDirectory()) { continue; }
				const files = await fsP.readdir(appPath);
				const dates = files
					.filter((f) => f.endsWith('.log'))
					.map((f) => f.replace('.log', ''))
					.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
					.sort().reverse();

				let appBytes = 0;
				for (const f of files.filter((f) => f.endsWith('.log'))) {
					try {
						const s = await fsP.stat(path.join(appPath, f));
						appBytes += s.size;
					} catch {}
				}
				totalBytes += appBytes;
				apps.push({ appName: app, dates, bytes: appBytes });
			} catch {}
		}

		res.json({ apps, totalBytes });
	} catch (err) {
		res.status(500).json({ error: 'Could not read stats' });
	}
});

// GET /logs/volume - log volume over last N hours (mock – replace with real counting)
router.get('/volume', authenticate, (req, res) => {
	const hours = parseInt(req.query.hours) || 24;
	const labels = [];
	const values = [];
	const now = Date.now();
	for (let i = hours; i >= 0; i--) {
		const label = new Date(now - i * 3600000).toLocaleTimeString();
		labels.push(label);
		values.push(Math.floor(Math.random() * 50)); // Replace with actual log counting
	}
	res.json({ labels, values });
});

// GET /settings/retention
router.get('/retention', authenticate, (req, res) => {
	res.json({ retentionDays: loadRetention() });
});

// PUT /settings/retention
router.put('/retention', authenticate, (req, res) => {
	const days = parseInt(req.body.days, 10);
	if (isNaN(days) || days < 1 || days > 365) {
		return res.status(400).json({ error: 'Invalid days (1-365)' });
	}
	saveRetention(days);
	// Optionally update config.RETENTION_DAYS if you want the scheduled job to pick it up
	res.json({ success: true });
});

// POST /cleanup - manual cleanup
router.post('/cleanup', authenticate, (req, res) => {
	cleanupOldLogs(); // runs asynchronously
	res.json({ success: true });
});

// GET /metrics - simple Prometheus-style metrics
router.get('/metrics', (req, res) => {
	const mem = process.memoryUsage();
	const cpu = process.cpuUsage();
	res.set('Content-Type', 'text/plain');
	res.send(
		'# HELP nodejs_heap_bytes Heap memory usage\n'
    + '# TYPE nodejs_heap_bytes gauge\n'
    + `nodejs_heap_bytes{type="heapTotal"} ${mem.heapTotal}\n`
    + `nodejs_heap_bytes{type="heapUsed"} ${mem.heapUsed}\n`
    + '# HELP nodejs_cpu_seconds_total Total CPU seconds\n'
    + '# TYPE nodejs_cpu_seconds_total counter\n'
    + `nodejs_cpu_seconds_total ${(cpu.user + cpu.system) / 1e6}\n`
    + '# HELP process_uptime_seconds Process uptime\n'
    + '# TYPE process_uptime_seconds gauge\n'
    + `process_uptime_seconds ${process.uptime()}\n`,
	);
});

module.exports = router;