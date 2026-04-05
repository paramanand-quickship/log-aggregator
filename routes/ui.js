'use strict';
const { Router }         = require('express');
const LogService         = require('../services/LogService');
const AnalyticsService   = require('../services/AnalyticsService');
const UiController       = require('../controllers/UiController');
const { authenticateUI } = require('../middleware/auth');
const { requirePage }    = require('../middleware/pageAccess');
const router = Router();

let ctrl;
module.exports.setWriter = function(bw) {
  ctrl = new UiController(new LogService(bw), new AnalyticsService());
};

router.get('/login',     (req,res) => ctrl.loginPage(req,res));
router.get('/',          authenticateUI,                            (req,res)=>ctrl.dashboard(req,res));
router.get('/dashboard', authenticateUI,                            (req,res)=>ctrl.dashboard(req,res));
router.get('/logs',      authenticateUI, requirePage('logs'),       (req,res)=>ctrl.logsPage(req,res));
router.get('/live',      authenticateUI, requirePage('live'),       (req,res)=>ctrl.livePage(req,res));
router.get('/insights',  authenticateUI, requirePage('insights'),   (req,res)=>ctrl.insightsPage(req,res));
router.get('/health',    authenticateUI, requirePage('health'),     (req,res)=>ctrl.healthPage(req,res));
router.get('/settings',  authenticateUI, requirePage('settings'),   (req,res)=>ctrl.settingsPage(req,res));
router.get('/users',     authenticateUI, requirePage('users'),      (req,res)=>ctrl.usersPage(req,res));
router.get('/api-keys',  authenticateUI, requirePage('api-keys'),   (req,res)=>ctrl.apiKeysPage(req,res));
router.get('/roles',     authenticateUI, requirePage('roles'),      (req,res)=>ctrl.rolesPage(req,res));
// Legacy redirects
router.get('/analytics',     authenticateUI, (req,res)=>res.redirect('/insights?tab=log'+(req.query.service?'&service='+req.query.service:'')+(req.query.date?'&date='+req.query.date:'')));
router.get('/api-analytics', authenticateUI, (req,res)=>res.redirect('/insights?tab=api'));

module.exports.router = router;
