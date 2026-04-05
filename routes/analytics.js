'use strict';
const { Router }           = require('express');
const AnalyticsService     = require('../services/AnalyticsService');
const AnalyticsController  = require('../controllers/AnalyticsController');
const { authenticate }     = require('../middleware/auth');

const router = Router();
const ctrl   = new AnalyticsController(new AnalyticsService());

router.get('/overview',      authenticate, (req, res) => ctrl.overview(req, res));
router.get('/hourly',        authenticate, (req, res) => ctrl.hourly(req, res));
router.get('/levels',        authenticate, (req, res) => ctrl.levels(req, res));
router.get('/top-services',  authenticate, (req, res) => ctrl.topServices(req, res));
router.get('/recent-errors', authenticate, (req, res) => ctrl.recentErrors(req, res));
router.get('/trend',         authenticate, (req, res) => ctrl.trend(req, res));

module.exports = router;
