'use strict';
const { Router }           = require('express');
const RoleConfigController = require('../controllers/RoleConfigController');
const { authenticate }     = require('../middleware/auth');
const requireRole          = require('../middleware/roles');

const router = Router();
const ctrl   = new RoleConfigController();

router.get('/',  authenticate,                       (req, res) => ctrl.getConfig(req, res));
router.post('/', authenticate, requireRole('admin'), (req, res) => ctrl.saveConfig(req, res));

module.exports = router;
