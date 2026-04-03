'use strict';
const fsP = require('fs').promises;
const config = require('../config');
const { getToday } = require('../lib/utils');
const {
	RoleConfigService,
	ALL_PAGES,
	ALL_CARDS,
} = require('../services/RoleConfigService');

class UiController {
	constructor (logService, analyticsService) {
		this.logs = logService;
		this.analytics = analyticsService;
	}

	loginPage (req, res) {
		res.render('login', { title: 'Login', error: null });
	}

	async dashboard (req, res) {
		try {
			const overview = await this.analytics.getOverview();
			const hourly = await this.analytics.getHourlyVolume(null, getToday());
			const errors = await this.analytics.getRecentErrors(10);
			// res.render('dashboard', {
			//   title:    'Dashboard',
			//   user:     req.user,
			//   overview,
			//   hourly,
			//   errors,
			//   today:    getToday(),
			// });
			const rcSvc = new RoleConfigService();
			const allowedCards = await rcSvc.getAllowedCards(req.user.role);
			res.render('dashboard', {
				title: 'Dashboard',
				user: req.user,
				overview,
				hourly,
				errors,
				today: getToday(),
				allowedCards,
			});
		} catch (err) {
			res.render('dashboard', {
				title: 'Dashboard',
				user: req.user,
				overview: null,
				hourly: null,
				errors: [],
				today: getToday(),
				renderError: err.message,
			});
		}
	}

	async logsPage (req, res) {
		try {
			const services = await this.logs.getServices();
			const { service, date, level, q } = req.query;
			let results = null;
			if (service && date) {
				results = await this.logs.tail(service, date, 200);
			}
			res.render('logs', {
				title: 'Logs',
				user: req.user,
				services,
				selected: {
					service: service || '',
					date: date || getToday(),
					level: level || '',
					q: q || '',
				},
				results,
				today: getToday(),
			});
		} catch (err) {
			res.render('logs', {
				title: 'Logs',
				user: req.user,
				services: [],
				selected: {},
				results: null,
				today: getToday(),
				renderError: err.message,
			});
		}
	}

	async livePage (req, res) {
		try {
			const services = await this.logs.getServices();
			res.render('live', { title: 'Live Stream', user: req.user, services });
		} catch {
			res.render('live', {
				title: 'Live Stream',
				user: req.user,
				services: [],
			});
		}
	}

	async analyticsPage (req, res) {
		try {
			const services = await this.logs.getServices();
			const { service, date } = req.query;
			const today = getToday();
			const selDate = date || today;
			const hourly = await this.analytics.getHourlyVolume(
				service || null,
				selDate,
			);
			const breakdown = await this.analytics.getLevelBreakdown(
				service || null,
				selDate,
			);
			const topSvcs = await this.analytics.getTopServices(selDate, 10);
			const trend = await this.analytics.getDailyTrend(service || null, 7);
			res.render('analytics', {
				title: 'Analytics',
				user: req.user,
				services,
				selected: { service: service || '', date: selDate },
				hourly,
				breakdown,
				topSvcs,
				trend,
				today,
			});
		} catch (err) {
			res.render('analytics', {
				title: 'Analytics',
				user: req.user,
				services: [],
				selected: {},
				hourly: null,
				breakdown: null,
				topSvcs: [],
				trend: [],
				today: getToday(),
				renderError: err.message,
			});
		}
	}

	// ── Settings page

	// ── Health page ─────────────────────────────────────────────────────────

	async healthPage (req, res) {
		try {
			const mem = process.memoryUsage();
			const cpu = process.cpuUsage();
			const upSec = Math.floor(process.uptime());
			const h = Math.floor(upSec / 3600);
			const m = Math.floor((upSec % 3600) / 60);
			const s = upSec % 60;

			let logDirOk = true;
			try {
				await fsP.access(config.LOG_BASE_DIR);
			} catch {
				logDirOk = false;
			}

			let overview = null;
			try {
				overview = await this.analytics.getOverview();
			} catch {
				/* non-fatal */
			}

			const status = logDirOk ? 'ok' : 'degraded';

			res.render('health', {
				title: 'Health',
				user: req.user,
				status,
				timestamp: new Date().toISOString(),
				uptimeHuman: `${h}h ${m}m ${s}s`,
				uptimeSec: upSec,
				memory: {
					rss: Math.round(mem.rss / 1024 / 1024),
					heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
					heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
					external: Math.round((mem.external || 0) / 1024 / 1024),
				},
				cpu: {
					user: (cpu.user / 1e6).toFixed(3),
					system: (cpu.system / 1e6).toFixed(3),
					total: ((cpu.user + cpu.system) / 1e6).toFixed(3),
				},
				proc: {
					version: process.version,
					pid: process.pid,
					platform: process.platform,
					arch: process.arch,
					cwd: process.cwd(),
					env: config.NODE_ENV,
				},
				checks: {
					logDir: logDirOk ? 'ok' : 'missing',
					stream: config.ENABLE_STREAM ? 'enabled' : 'disabled',
				},
				cfg: {
					port: config.PORT,
					logBaseDir: config.LOG_BASE_DIR,
					retentionDays: config.RETENTION_DAYS,
					batchSize: config.BATCH_SIZE,
					batchTimeout: config.BATCH_TIMEOUT,
					maxBodySize: config.MAX_BODY_SIZE,
					enableStream: config.ENABLE_STREAM,
					corsOrigins: config.CORS_ORIGINS,
					webhookUrl: config.WEBHOOK_URL ? '(configured)' : '(not set)',
				},
				overview,
			});
		} catch (err) {
			res.status(500).render('404', { title: 'Error', user: req.user || null });
		}
	}

	// ── Settings page ────────────────────────────────────────────────────────

	async settingsPage (req, res) {
		try {
			const SettingsService = require('../services/SettingsService');
			const AuthService = require('../services/AuthService');
			const svc = new SettingsService();
			const authSvc = new AuthService();
			const [settings, totpStatus] = await Promise.all([
				svc.get(),
				authSvc.getTotpStatus(req.user.username),
			]);
			res.render('settings', {
				title: 'Settings',
				user: req.user,
				isAdmin: req.user.role === 'admin',
				settings,
				totpEnabled: totpStatus.enabled,
			});
		} catch (err) {
			res.status(500).render('404', { title: 'Error', user: req.user || null });
		}
	}

	// ── API Analytics page ──────────────────────────────────────────────────

	async apiAnalyticsPage (req, res) {
		try {
			const ApiAnalyticsService = require('../services/ApiAnalyticsService');
			const svc = new ApiAnalyticsService();
			const services = await svc.getApiServices();
			const { service, date } = req.query;
			const today = require('../lib/utils').getToday();
			const selSvc = service || services[0]?.appName || '';
			const selDate = date || today;
			res.render('api-analytics', {
				title: 'API Analytics',
				user: req.user,
				services,
				today,
				selected: { service: selSvc, date: selDate },
			});
		} catch (err) {
			res.status(500).render('404', { title: 'Error', user: req.user || null });
		}
	}

	async rolesPage (req, res) {
		try {
			const rcSvc = new RoleConfigService();
			const [cfg, users] = await Promise.all([
				rcSvc.getConfig(),
				require('../lib/userStore').getUsers(),
			]);
			const roles = [
				...new Set(Object.values(users).map((u) => u.role || 'viewer')),
			].sort();
			res.render('roles', {
				title: 'Role Config',
				user: req.user,
				roles,
				config: cfg,
				allPages: ALL_PAGES,
				allCards: ALL_CARDS,
			});
		} catch (err) {
			res.status(500).render('404', { title: 'Error', user: req.user || null });
		}
	}
}

module.exports = UiController;
