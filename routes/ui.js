'use strict';
const { Router }         = require('express');
const LogService         = require('../services/LogService');
const AnalyticsService   = require('../services/AnalyticsService');
const UiController       = require('../controllers/UiController');
const { authenticateUI } = require('../middleware/auth');

const router = Router();

// batchWriter injected by server.js
let ctrl;
module.exports.setWriter = function (batchWriter) {
  ctrl = new UiController(new LogService(batchWriter), new AnalyticsService());
};

router.get('/login',     (req, res)                => ctrl.loginPage(req, res));
router.get('/',          authenticateUI,            (req, res) => ctrl.dashboard(req, res));
router.get('/dashboard', authenticateUI,            (req, res) => ctrl.dashboard(req, res));
router.get('/logs',      authenticateUI,            (req, res) => ctrl.logsPage(req, res));
router.get('/live',      authenticateUI,            (req, res) => ctrl.livePage(req, res));
router.get('/analytics', authenticateUI,            (req, res) => ctrl.analyticsPage(req, res));

module.exports.router = router;
