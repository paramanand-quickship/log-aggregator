'use strict';
const { Router } = require('express');
const SettingsService = require('../services/SettingsService');
const SettingsController = require('../controllers/SettingsController');
const { authenticate } = require('../middleware/auth');
const requireRole = require('../middleware/roles');

const router = Router();
const ctrl = new SettingsController(new SettingsService());

// Any authenticated user can read settings
router.get('/', authenticate, (req, res) => ctrl.getSettings(req, res));

// Admin-only mutations
router.post('/', authenticate, requireRole('admin'), (req, res) => ctrl.saveSettings(req, res));
router.post('/cleanup', authenticate, requireRole('admin'), (req, res) => ctrl.runCleanup(req, res));
router.post('/reset', authenticate, requireRole('admin'), (req, res) => ctrl.resetSettings(req, res));

module.exports = router;
