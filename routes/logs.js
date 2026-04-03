'use strict';
const { Router } = require('express');
const LogController = require('../controllers/LogController');
const validateApiKey = require('../middleware/apiKey');
const { authenticate } = require('../middleware/auth');
const requireRole = require('../middleware/roles');
const rateLimit = require('../middleware/rateLimit');

const router = Router();
const ingestLimit = rateLimit({
	windowMs: 60_000,
	max: 1000,
	message: 'Ingest rate limit exceeded',
});

// batchWriter is injected by server.js via module.exports.setWriter
let ctrl;
module.exports.setWriter = function (batchWriter) {
	const LogService = require('../services/LogService');
	ctrl = new LogController(new LogService(batchWriter));
};

// ── Ingest (API key auth) ────────────────────────────────────────────────
router.post('/', validateApiKey, ingestLimit, (req, res) =>
	ctrl.ingest(req, res),
);
router.post('/bulk', validateApiKey, ingestLimit, (req, res) =>
	ctrl.ingest(req, res),
);

// ── Read (JWT auth, viewer+) ─────────────────────────────────────────────
router.get('/services', authenticate, (req, res) => ctrl.services(req, res));
router.get('/tail/:appName/:date', authenticate, (req, res) =>
	ctrl.tail(req, res),
);
router.get('/search', authenticate, (req, res) => ctrl.search(req, res));
router.get('/replay', authenticate, (req, res) => ctrl.replay(req, res));
router.get('/download/:appName/:date', authenticate, (req, res) =>
	ctrl.download(req, res),
);

module.exports.router = router;
