'use strict';
const { Router }             = require('express');
const AuthService            = require('../services/AuthService');
const AuthController         = require('../controllers/AuthController');
const { authenticate }       = require('../middleware/auth');
const rateLimit              = require('../middleware/rateLimit');

const router     = Router();
const svc        = new AuthService();
const ctrl       = new AuthController(svc);
const loginLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Too many login attempts' });

router.post('/login',           loginLimit,   (req, res) => ctrl.login(req, res));
router.post('/logout',                        (req, res) => ctrl.logout(req, res));
router.get('/verify',                         (req, res) => ctrl.verify(req, res));
router.get('/2fa/setup',        authenticate, (req, res) => ctrl.setup2fa(req, res));
router.post('/2fa/enable',      authenticate, (req, res) => ctrl.enable2fa(req, res));
router.post('/2fa/disable',     authenticate, (req, res) => ctrl.disable2fa(req, res));
router.get('/2fa/status',       authenticate, (req, res) => ctrl.totpStatus(req, res));
router.post('/change-password', authenticate, (req, res) => ctrl.changePassword(req, res));

module.exports = router;
