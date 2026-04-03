'use strict';
const { Router }              = require('express');
const ApiAnalyticsService     = require('../services/ApiAnalyticsService');
const ApiAnalyticsController  = require('../controllers/ApiAnalyticsController');
const { authenticate }        = require('../middleware/auth');

const router = Router();
const ctrl   = new ApiAnalyticsController(new ApiAnalyticsService());

router.get('/services',  authenticate, (req, res) => ctrl.services(req, res));
router.get('/overview',  authenticate, (req, res) => ctrl.overview(req, res));
router.get('/hourly',    authenticate, (req, res) => ctrl.hourly(req, res));
router.get('/endpoints', authenticate, (req, res) => ctrl.endpoints(req, res));
router.get('/slowest',   authenticate, (req, res) => ctrl.slowest(req, res));
router.get('/errors',    authenticate, (req, res) => ctrl.topErrors(req, res));
router.get('/status',    authenticate, (req, res) => ctrl.statusDist(req, res));

module.exports = router;
