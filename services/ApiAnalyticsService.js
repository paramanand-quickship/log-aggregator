'use strict';
const fs = require('fs');
const fsP = require('fs').promises;
const path = require('path');
const readline = require('readline');
const config = require('../config');
const {
	getToday,
	sanitizeAppName,
	sanitizeDate,
	formatBytes,
} = require('../lib/utils');

class ApiAnalyticsService {
	// ─── List services that have request logs ─────────────────────────────────

	async getApiServices () {
		let dirs = [];
		try {
			dirs = await fsP.readdir(config.LOG_BASE_DIR);
		} catch (e) {
			if (e.code !== 'ENOENT') {
				throw e;
			}
		}
		const results = [];
		for (const dir of dirs) {
			if (!dir.endsWith('-requests')) {
				continue;
			}
			const fullPath = path.join(config.LOG_BASE_DIR, dir);
			try {
				const stat = await fsP.stat(fullPath);
				if (!stat.isDirectory()) {
					continue;
				}
				// Derive the base appName (strip '-requests')
				const baseApp = dir.slice(0, -'-requests'.length);
				results.push({ appName: dir, baseApp, dir: fullPath });
			} catch {}
		}
		return results;
	}

	// ─── Parse all api_request entries for a service+date ───────────────────

	async _parseRequestLogs (appName, date) {
		const safeApp = sanitizeAppName(appName);
		const safeDate = sanitizeDate(date);
		const filePath = path.join(config.LOG_BASE_DIR, safeApp, `${safeDate}.log`);
		const entries = [];

		if (!fs.existsSync(filePath)) {
			return entries;
		}

		await new Promise((resolve) => {
			const stream = fs.createReadStream(filePath, 'utf8');
			const rl = readline.createInterface({
				input: stream,
				crlfDelay: Infinity,
			});
			rl.on('line', (line) => {
				if (!line.trim()) {
					return;
				}
				try {
					const p = JSON.parse(line);
					if (p.type === 'api_request' && p.method && p.path) {
						entries.push(p);
					}
				} catch {}
			});
			rl.on('close', resolve);
			rl.on('error', resolve);
			stream.on('error', resolve);
		});

		return entries;
	}

	// ─── Compute per-endpoint stats ──────────────────────────────────────────

	_computeEndpointStats (entries) {
		const map = new Map();

		for (const e of entries) {
			const key = `${e.method} ${e.path}`;
			if (!map.has(key)) {
				map.set(key, {
					method: e.method,
					path: e.path,
					count: 0,
					durations: [],
					totalReqBytes: 0,
					totalResBytes: 0,
					errors: 0, // 4xx + 5xx
					errors5xx: 0,
					statusCodes: {},
					lastSeen: null,
				});
			}
			const s = map.get(key);
			s.count++;
			s.durations.push(e.durationMs || 0);
			s.totalReqBytes += e.reqSizeBytes || 0;
			s.totalResBytes += e.resSizeBytes || 0;
			if (e.statusCode >= 400) {
				s.errors++;
			}
			if (e.statusCode >= 500) {
				s.errors5xx++;
			}
			s.statusCodes[e.statusCode] = (s.statusCodes[e.statusCode] || 0) + 1;
			if (!s.lastSeen || e.ts > s.lastSeen) {
				s.lastSeen = e.ts;
			}
		}

		const results = [];
		for (const s of map.values()) {
			const sorted = [...s.durations].sort((a, b) => a - b);
			const total = sorted.reduce((a, b) => a + b, 0);
			const avg = s.count ? total / s.count : 0;
			const p95idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
			const p99idx = Math.max(0, Math.ceil(sorted.length * 0.99) - 1);

			results.push({
				method: s.method,
				path: s.path,
				count: s.count,
				avgDuration: Math.round(avg * 10) / 10,
				p95Duration: sorted[p95idx] || 0,
				p99Duration: sorted[p99idx] || 0,
				maxDuration: sorted[sorted.length - 1] || 0,
				minDuration: sorted[0] || 0,
				avgReqBytes: s.count ? Math.round(s.totalReqBytes / s.count) : 0,
				avgResBytes: s.count ? Math.round(s.totalResBytes / s.count) : 0,
				totalReqBytes: s.totalReqBytes,
				totalResBytes: s.totalResBytes,
				errors: s.errors,
				errors5xx: s.errors5xx,
				errorRate: s.count ? ((s.errors / s.count) * 100).toFixed(1) : '0.0',
				statusCodes: s.statusCodes,
				lastSeen: s.lastSeen,
			});
		}
		return results;
	}

	// ─── Overview stats card ─────────────────────────────────────────────────

	async getOverview (appName, date) {
		date = date || getToday();
		const entries = await this._parseRequestLogs(appName, date);
		if (!entries.length) {
			return this._emptyOverview(date);
		}

		const totalRequests = entries.length;
		const totalErrors = entries.filter((e) => e.statusCode >= 400).length;
		const totalErrors5xx = entries.filter((e) => e.statusCode >= 500).length;
		const avgDuration
      = entries.reduce((a, e) => a + (e.durationMs || 0), 0) / totalRequests;
		const maxDuration = Math.max(...entries.map((e) => e.durationMs || 0));
		const totalReqBytes = entries.reduce(
			(a, e) => a + (e.reqSizeBytes || 0),
			0,
		);
		const totalResBytes = entries.reduce(
			(a, e) => a + (e.resSizeBytes || 0),
			0,
		);

		return {
			date,
			appName,
			totalRequests,
			totalErrors,
			totalErrors5xx,
			errorRate: totalRequests
				? ((totalErrors / totalRequests) * 100).toFixed(1)
				: '0.0',
			errorRate5xx: totalRequests
				? ((totalErrors5xx / totalRequests) * 100).toFixed(1)
				: '0.0',
			avgDuration: Math.round(avgDuration * 10) / 10,
			maxDuration,
			totalReqBytes,
			totalResBytes,
			totalDataHuman: formatBytes(totalReqBytes + totalResBytes),
			totalResHuman: formatBytes(totalResBytes),
			totalReqHuman: formatBytes(totalReqBytes),
		};
	}

	_emptyOverview (date) {
		return {
			date,
			totalRequests: 0,
			totalErrors: 0,
			totalErrors5xx: 0,
			errorRate: '0.0',
			errorRate5xx: '0.0',
			avgDuration: 0,
			maxDuration: 0,
			totalReqBytes: 0,
			totalResBytes: 0,
			totalDataHuman: '0 B',
			totalResHuman: '0 B',
			totalReqHuman: '0 B',
		};
	}

	// ─── Hourly breakdown ────────────────────────────────────────────────────

	async getHourlyVolume (appName, date) {
		date = date || getToday();
		const entries = await this._parseRequestLogs(appName, date);
		const hours = Array.from({ length: 24 }, (_, i) => ({
			hour: i,
			total: 0,
			ok: 0,
			warn: 0,
			error: 0,
			avgDuration: 0,
			_durations: [],
		}));

		for (const e of entries) {
			const h = new Date(e.ts).getUTCHours();
			hours[h].total++;
			hours[h]._durations.push(e.durationMs || 0);
			if (e.statusCode >= 500) {
				hours[h].error++;
			} else if (e.statusCode >= 400) {
				hours[h].warn++;
			} else {
				hours[h].ok++;
			}
		}

		for (const h of hours) {
			if (h._durations.length) {
				h.avgDuration = Math.round(
					h._durations.reduce((a, b) => a + b, 0) / h._durations.length,
				);
			}
			delete h._durations;
		}

		return { date, appName, hours };
	}

	// ─── All endpoint stats ───────────────────────────────────────────────────

	async getEndpointStats (appName, date) {
		date = date || getToday();
		const entries = await this._parseRequestLogs(appName, date);
		return this._computeEndpointStats(entries);
	}

	// ─── Top slowest endpoints ────────────────────────────────────────────────

	async getTopSlowest (appName, date, topN = 10) {
		const stats = await this.getEndpointStats(appName, date);
		return stats
			.filter((s) => s.count >= 1)
			.sort((a, b) => b.avgDuration - a.avgDuration)
			.slice(0, topN);
	}

	// ─── Most errored endpoints ───────────────────────────────────────────────

	async getTopErrors (appName, date, topN = 10) {
		const stats = await this.getEndpointStats(appName, date);
		return stats
			.filter((s) => s.errors > 0)
			.sort((a, b) => b.errors - a.errors)
			.slice(0, topN);
	}

	// ─── Highest volume endpoints ─────────────────────────────────────────────

	async getTopVolume (appName, date, topN = 10) {
		const stats = await this.getEndpointStats(appName, date);
		return stats.sort((a, b) => b.count - a.count).slice(0, topN);
	}

	// ─── Status code distribution ─────────────────────────────────────────────

	async getStatusDistribution (appName, date) {
		date = date || getToday();
		const entries = await this._parseRequestLogs(appName, date);
		const dist = {};
		for (const e of entries) {
			const bucket = Math.floor(e.statusCode / 100) * 100;
			dist[bucket] = (dist[bucket] || 0) + 1;
		}
		return { date, appName, distribution: dist, total: entries.length };
	}
}

module.exports = ApiAnalyticsService;
