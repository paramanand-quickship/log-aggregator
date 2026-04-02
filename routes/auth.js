'use strict';
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const config = require('../config');
const { getUsers, saveUsers } = require('../lib/userStore');
const authenticate = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const logger = require('../lib/logger');

const router = express.Router();

// Strict rate-limit for login (5 attempts / 15 min per IP)
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5, message: 'Too many login attempts' });

// ── POST /auth/login ──────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
	try {
		const { username, password, token } = req.body;

		if (!username || !password) {
			return res.status(400).json({ error: 'username and password are required' });
		}
		if (typeof username !== 'string' || typeof password !== 'string') {
			return res.status(400).json({ error: 'Invalid input types' });
		}

		const users = await getUsers();
		const user = users[username];

		// Use constant-time compare even when user doesn't exist (timing-safe)
		const dummyHash = '$2a$10$invalidhashfortimingprotection000000000000000000000000';
		const valid = await bcrypt.compare(password, user ? user.password : dummyHash);

		if (!user || !valid) {
			logger.warn(`[Auth] Failed login attempt for "${username}" from ${req.ip}`);
			return res.status(401).json({ error: 'Invalid credentials' });
		}

		if (user.totpSecret) {
			if (!token) { return res.status(401).json({ error: '2FA token required' }); }
			const verified = speakeasy.totp.verify({
				secret: user.totpSecret,
				encoding: 'base32',
				token,
				window: 1, // allow 1 step drift
			});
			if (!verified) {
				logger.warn(`[Auth] Invalid 2FA token for "${username}" from ${req.ip}`);
				return res.status(401).json({ error: 'Invalid 2FA token' });
			}
		}

		const jwtToken = jwt.sign({ username }, config.JWT_SECRET, { expiresIn: '1d' });

		res.cookie(config.SESSION_NAME, jwtToken, {
			httpOnly: true,
			secure: config.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 24 * 60 * 60 * 1000,
		});

		logger.info(`[Auth] Successful login for "${username}" from ${req.ip}`);
		res.json({ success: true, totpEnabled: !!user.totpSecret });
	} catch (err) {
		logger.error(`[Auth] Login error: ${err.message}`);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// ── POST /auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
	res.clearCookie(config.SESSION_NAME, { httpOnly: true, sameSite: 'strict' });
	res.json({ success: true });
});

// ── GET /auth/verify ──────────────────────────────────────────────────────
router.get('/verify', (req, res) => {
	const token = req.cookies[config.SESSION_NAME];
	if (!token) { return res.status(401).json({ error: 'No session' }); }
	try {
		const payload = jwt.verify(token, config.JWT_SECRET);
		res.json({ valid: true, username: payload.username });
	} catch {
		res.status(401).json({ error: 'Invalid or expired session' });
	}
});

// ── GET /auth/2fa/setup ───────────────────────────────────────────────────
router.get('/2fa/setup', authenticate, async (req, res) => {
	try {
		const { username } = req.user;
		const secret = speakeasy.generateSecret({
			length: 20,
			name: `LogAggregator (${username})`,
		});

		// Store temp secret per-user to avoid race conditions
		if (!req.app.locals.tempTotpSecrets) { req.app.locals.tempTotpSecrets = {}; }
		req.app.locals.tempTotpSecrets[username] = secret;

		const dataUrl = await QRCode.toDataURL(secret.otpauth_url);
		res.json({ secret: secret.base32, qr: dataUrl });
	} catch (err) {
		logger.error(`[Auth] 2FA setup error: ${err.message}`);
		res.status(500).json({ error: '2FA setup failed' });
	}
});

// ── POST /auth/2fa/verify ─────────────────────────────────────────────────
router.post('/2fa/verify', authenticate, async (req, res) => {
	try {
		const { username } = req.user;
		const { token: otp } = req.body;

		if (!otp) { return res.status(400).json({ error: 'OTP token is required' }); }

		const tempSecrets = req.app.locals.tempTotpSecrets || {};
		const secret = tempSecrets[username];
		if (!secret) { return res.status(400).json({ error: '2FA not initialized — call /auth/2fa/setup first' }); }

		const verified = speakeasy.totp.verify({
			secret: secret.base32,
			encoding: 'base32',
			token: otp,
			window: 1,
		});

		if (!verified) { return res.status(400).json({ error: 'Invalid OTP token' }); }

		const users = await getUsers();
		if (!users[username]) { return res.status(404).json({ error: 'User not found' }); }

		users[username].totpSecret = secret.base32;
		await saveUsers(users);

		// Clean up per-user temp secret
		delete req.app.locals.tempTotpSecrets[username];

		logger.info(`[Auth] 2FA enabled for "${username}"`);
		res.json({ success: true, message: '2FA successfully enabled' });
	} catch (err) {
		logger.error(`[Auth] 2FA verify error: ${err.message}`);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// ── POST /auth/2fa/disable ────────────────────────────────────────────────
router.post('/2fa/disable', authenticate, async (req, res) => {
	try {
		const { username } = req.user;
		const users = await getUsers();
		if (!users[username]) { return res.status(404).json({ error: 'User not found' }); }

		delete users[username].totpSecret;
		await saveUsers(users);

		logger.info(`[Auth] 2FA disabled for "${username}"`);
		res.json({ success: true, message: '2FA disabled' });
	} catch (err) {
		logger.error(`[Auth] 2FA disable error: ${err.message}`);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// ── POST /auth/change-password ─────────────────────────────────────────────
router.post('/change-password', authenticate, async (req, res) => {
	try {
		const { username } = req.user;
		const { currentPassword, newPassword } = req.body;

		if (!currentPassword || !newPassword) {
			return res.status(400).json({ error: 'currentPassword and newPassword are required' });
		}
		if (typeof newPassword !== 'string' || newPassword.length < 8) {
			return res.status(400).json({ error: 'New password must be at least 8 characters' });
		}

		const users = await getUsers();
		const user = users[username];
		if (!user) { return res.status(404).json({ error: 'User not found' }); }

		const valid = await bcrypt.compare(currentPassword, user.password);
		if (!valid) { return res.status(401).json({ error: 'Current password is incorrect' }); }

		users[username].password = await bcrypt.hash(newPassword, 12);
		await saveUsers(users);

		logger.info(`[Auth] Password changed for "${username}"`);
		res.json({ success: true });
	} catch (err) {
		logger.error(`[Auth] Change password error: ${err.message}`);
		res.status(500).json({ error: 'Internal server error' });
	}
});

router.get('/2fa/status', authenticate, async (req, res) => {
	try {
		const { username } = req.user;
		const users = await getUsers();
		const user = users[username];
		if (!user) { return res.status(404).json({ error: 'User not found' }); }
		res.json({ enabled: !!user.totpSecret });
	} catch (err) {
		logger.error(`[Auth] 2FA status error: ${err.message}`);
		res.status(500).json({ error: 'Internal server error' });
	}
});

module.exports = router;
