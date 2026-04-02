'use strict';
const { Router }       = require('express');
const HealthController = require('../controllers/HealthController');

const router = Router();
const ctrl   = new HealthController();

router.get('/',        (req, res) => ctrl.health(req, res));
router.get('/metrics', (req, res) => ctrl.metrics(req, res));

module.exports = router;
