'use strict';
const config = require('../config');

class AuthController {
  constructor(authService) { this.svc = authService; }

  async login(req, res) {
    try {
      const { username, password, token } = req.body;
      const result = await this.svc.login(username, password, token);
      res.cookie(config.SESSION_NAME, result.token, {
        httpOnly: true,
        secure:   config.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   24 * 60 * 60 * 1000,
      });
      res.json({ success: true, role: result.role, totpEnabled: result.totpEnabled });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }

  logout(req, res) {
    res.clearCookie(config.SESSION_NAME, { httpOnly: true, sameSite: 'strict' });
    res.json({ success: true });
  }

  verify(req, res) {
    const jwt = require('jsonwebtoken');
    const tok = req.cookies[config.SESSION_NAME];
    if (!tok) return res.status(401).json({ error: 'No session' });
    try {
      const payload = jwt.verify(tok, config.JWT_SECRET);
      res.json({ valid: true, username: payload.username, role: payload.role });
    } catch { res.status(401).json({ error: 'Invalid or expired session' }); }
  }

  async setup2fa(req, res) {
    try {
      const result = await this.svc.setupTotp(req.user.username);
      res.json(result);
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }

  async enable2fa(req, res) {
    try {
      const { secret, token } = req.body;
      if (!secret || !token) return res.status(400).json({ error: 'secret and token required' });
      await this.svc.enableTotp(req.user.username, secret, token);
      res.json({ success: true });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }

  async disable2fa(req, res) {
    try {
      await this.svc.disableTotp(req.user.username);
      res.json({ success: true });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      await this.svc.changePassword(req.user.username, currentPassword, newPassword);
      res.json({ success: true });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }

  async totpStatus(req, res) {
    try {
      const result = await this.svc.getTotpStatus(req.user.username);
      res.json(result);
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
  }
}

module.exports = AuthController;
