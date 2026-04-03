'use strict';
const fsP = require('fs').promises;
const config = require('../config');

const startTime = Date.now();

class HealthController {
	async health (req, res) {
		const mem = process.memoryUsage();
		const uptime = Math.floor((Date.now() - startTime) / 1000);

		let logDirOk = true;
		try { await fsP.access(config.LOG_BASE_DIR); } catch { logDirOk = false; }

		res.json({
			status: 'ok',
			timestamp: new Date().toISOString(),
			uptime,
			uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
			memory: {
				rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
				heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
				heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
			},
			checks: {
				logDir: logDirOk ? 'ok' : 'missing',
				stream: config.ENABLE_STREAM ? 'enabled' : 'disabled',
				nodeVer: process.version,
				env: config.NODE_ENV,
			},
		});
	}

	metrics (req, res) {
		const mem = process.memoryUsage();
		const cpu = process.cpuUsage();
		res.setHeader('Content-Type', 'text/plain; version=0.0.4');
		res.send([
			'# HELP nodejs_heap_bytes Heap memory bytes',
			'# TYPE nodejs_heap_bytes gauge',
			`nodejs_heap_bytes{type="heapTotal"} ${mem.heapTotal}`,
			`nodejs_heap_bytes{type="heapUsed"}  ${mem.heapUsed}`,
			'# HELP nodejs_rss_bytes Resident set size bytes',
			'# TYPE nodejs_rss_bytes gauge',
			`nodejs_rss_bytes ${mem.rss}`,
			'# HELP process_cpu_seconds_total Total CPU time seconds',
			'# TYPE process_cpu_seconds_total counter',
			`process_cpu_seconds_total ${((cpu.user + cpu.system) / 1e6).toFixed(3)}`,
			'# HELP process_uptime_seconds Process uptime seconds',
			'# TYPE process_uptime_seconds gauge',
			`process_uptime_seconds ${process.uptime().toFixed(1)}`,
		].join('\n'));
	}
}

module.exports = HealthController;
