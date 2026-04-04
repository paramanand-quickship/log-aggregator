'use strict';
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const { scheduleCleanup } = require('./lib/cleanup');
const { closeAllStreams } = require('./lib/streams');
const BatchWriter = require('./lib/batchWriter');
const logger = require('./lib/logger');
const ejsEngine = require('./lib/ejs');

const app = express();

// ── View engine (custom EJS-compatible renderer) ───────────────────────────
app.engine('ejs', ejsEngine.renderFile);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Security headers ───────────────────────────────────────────────────────
app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ['\'self\''],
				connectSrc: [
					'\'self\'',
					`http://localhost:${config.PORT}`,
					`ws://localhost:${config.PORT}`,
					'https://cdn.jsdelivr.net',
				],
				scriptSrc: [
					'\'self\'',
					'\'unsafe-inline\'',
					'https://cdn.jsdelivr.net',
					'https://unpkg.com',
				],
				scriptSrcAttr: ['\'unsafe-inline\''],
				styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com'],
				fontSrc: ['\'self\'', 'https://fonts.gstatic.com', 'data:'],
				imgSrc: ['\'self\'', 'data:'],
			},
		},
	}),
);

// ── CORS ───────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
	const { origin } = req.headers;
	if (
		!origin
    || config.CORS_ORIGINS.includes('*')
    || config.CORS_ORIGINS.includes(origin)
	) {
		if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); }
		res.setHeader(
			'Access-Control-Allow-Methods',
			'GET,POST,PUT,DELETE,OPTIONS',
		);
		res.setHeader(
			'Access-Control-Allow-Headers',
			'Content-Type, X-Api-Key, Authorization',
		);
		res.setHeader('Access-Control-Allow-Credentials', 'true');
	}
	if (req.method === 'OPTIONS') { return res.sendStatus(204); }
	next();
});

// ── Body / cookies ─────────────────────────────────────────────────────────
app.use(express.json({ limit: config.MAX_BODY_SIZE }));
app.use(cookieParser());

// ── Request logger ─────────────────────────────────────────────────────────
app.use((req, _res, next) => {
	logger.debug(`${req.method} ${req.path}`);
	next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
const healthRoute = require('./routes/health');
const authRoute = require('./routes/auth');
const streamRoute = require('./routes/stream');
const analyticsRoute = require('./routes/analytics');
const logsRoute = require('./routes/logs');
const uiRoute = require('./routes/ui');
const settingsRoute = require('./routes/settings');
const apiAnalyticsRoute = require('./routes/api-analytics');
const roleConfigRoute = require('./routes/role-config');

// ── Batch writer (shared singleton, injected into routes) ──────────────────
const batchWriter = new BatchWriter();
logsRoute.setWriter(batchWriter);
uiRoute.setWriter(batchWriter);

// ── Mount API routes ───────────────────────────────────────────────────────
app.use('/api/health', healthRoute);
app.use('/api/auth', authRoute);
app.use('/api/logs/stream', streamRoute);
app.use('/api/logs', logsRoute.router);
app.use('/api/analytics', analyticsRoute);
app.use('/api/settings', settingsRoute);
app.use('/api/api-analytics', apiAnalyticsRoute);
app.use('/api/role-config', roleConfigRoute);

// ── Mount UI routes (EJS) ─────────────────────────────────────────────────
app.use('/', uiRoute.router);

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((req, res) => {
	if (req.path.startsWith('/api/')) { return res.status(404).json({ error: 'Not found' }); }
	res.status(404).render('404', { title: '404', user: req.user || null });
});

// ── Global error handler ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
	logger.error(`Unhandled: ${err.stack}`);
	if (res.headersSent) { return; }
	res.status(500).json({ error: 'Internal server error' });
});

// ── Scheduled cleanup ──────────────────────────────────────────────────────
scheduleCleanup();

// ── Start ──────────────────────────────────────────────────────────────────
const server = app.listen(config.PORT, () => {
	logger.info(`Log aggregator v3  →  http://localhost:${config.PORT}`);
	logger.info(`Env: ${config.NODE_ENV}  |  Log dir: ${config.LOG_BASE_DIR}`);
	logger.info(
		`Batch: size=${config.BATCH_SIZE} timeout=${config.BATCH_TIMEOUT}ms  |  SSE: ${config.ENABLE_STREAM}`,
	);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
let shuttingDown = false;

async function shutdown (signal) {
	if (shuttingDown) { return; }
	shuttingDown = true;
	logger.info(`${signal} received. Shutting down…`);
	server.close(async () => {
		try {
			await batchWriter.flushAll();
		} catch (err) {
			logger.error(`Flush: ${err.message}`);
		}
		closeAllStreams();
		logger.info('Shutdown complete.');
		process.exit(0);
	});
	setTimeout(() => {
		logger.error('Forced exit.');
		process.exit(1);
	}, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
	logger.error(`Uncaught: ${err.stack}`);
	shutdown('uncaughtException');
});
process.on('unhandledRejection', (r) => {
	logger.error(`UnhandledRejection: ${r}`);
});
