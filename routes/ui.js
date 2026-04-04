'use strict';
const { Router } = require('express');
const LogService = require('../services/LogService');
const AnalyticsService = require('../services/AnalyticsService');
const UiController = require('../controllers/UiController');
const { authenticateUI } = require('../middleware/auth');
const { requirePage } = require('../middleware/pageAccess');

const router = Router();

let ctrl;
module.exports.setWriter = function (batchWriter) {
	ctrl = new UiController(new LogService(batchWriter), new AnalyticsService());
};

// No page-guard on login or dashboard (dashboard always accessible)
router.get('/login', (req, res) => ctrl.loginPage(req, res));
router.get('/', authenticateUI, (req, res) => ctrl.dashboard(req, res));
router.get('/dashboard', authenticateUI, (req, res) => ctrl.dashboard(req, res));

// Guarded pages
router.get('/logs', authenticateUI, requirePage('logs'), (req, res) => ctrl.logsPage(req, res));
router.get('/live', authenticateUI, requirePage('live'), (req, res) => ctrl.livePage(req, res));
router.get('/analytics', authenticateUI, requirePage('analytics'), (req, res) => ctrl.analyticsPage(req, res));
router.get('/api-analytics', authenticateUI, requirePage('api-analytics'), (req, res) => ctrl.apiAnalyticsPage(req, res));
router.get('/health', authenticateUI, requirePage('health'), (req, res) => ctrl.healthPage(req, res));
router.get('/settings', authenticateUI, requirePage('settings'), (req, res) => ctrl.settingsPage(req, res));
router.get('/roles', authenticateUI, requirePage('roles'), (req, res) => ctrl.rolesPage(req, res));

module.exports.router = router;
