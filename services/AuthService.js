'use strict';
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode   = require('qrcode');
const config   = require('../config');
const logger   = require('../lib/logger');
const { getUsers, saveUsers } = require('../lib/userStore');

class AuthService {

  async login(username, password, totpToken) {
    if (!username || !password) throw Object.assign(new Error('username and password required'), { status: 400 });
    if (typeof username !== 'string' || typeof password !== 'string') throw Object.assign(new Error('Invalid input'), { status: 400 });

    const users = await getUsers();
    const user  = users[username];

    // Timing-safe even when user doesn't exist
    const dummyHash = '$2a$10$invalidhashfortimingprotection000000000000000000000000';
    const valid     = await bcrypt.compare(password, user ? user.password : dummyHash);

    if (!user || !valid) {
      logger.warn(`[Auth] Failed login: "${username}"`);
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    if (user.totpSecret) {
      if (!totpToken) throw Object.assign(new Error('2FA token required'), { status: 401 });
      const ok = speakeasy.totp.verify({ secret: user.totpSecret, encoding: 'base32', token: totpToken, window: 1 });
      if (!ok) throw Object.assign(new Error('Invalid 2FA token'), { status: 401 });
    }

    const jwt_token = jwt.sign(
      { username, role: user.role || 'viewer' },
      config.JWT_SECRET,
      { expiresIn: '24h' }
    );
    logger.info(`[Auth] Login: "${username}" (${user.role || 'viewer'})`);
    return { token: jwt_token, role: user.role || 'viewer', totpEnabled: !!user.totpSecret };
  }

  async setupTotp(username) {
    const secret = speakeasy.generateSecret({ length: 20, name: `LogAggregator (${username})` });
    const qr     = await QRCode.toDataURL(secret.otpauth_url);
    return { secret: secret.base32, otpauth: secret.otpauth_url, qr };
  }

  async enableTotp(username, base32Secret, token) {
    const ok = speakeasy.totp.verify({ secret: base32Secret, encoding: 'base32', token, window: 1 });
    if (!ok) throw Object.assign(new Error('Invalid OTP'), { status: 400 });
    const users = await getUsers();
    if (!users[username]) throw Object.assign(new Error('User not found'), { status: 404 });
    users[username].totpSecret = base32Secret;
    await saveUsers(users);
    logger.info(`[Auth] 2FA enabled for "${username}"`);
  }

  async disableTotp(username) {
    const users = await getUsers();
    if (!users[username]) throw Object.assign(new Error('User not found'), { status: 404 });
    delete users[username].totpSecret;
    await saveUsers(users);
    logger.info(`[Auth] 2FA disabled for "${username}"`);
  }

  async changePassword(username, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) throw Object.assign(new Error('Both passwords required'), { status: 400 });
    if (typeof newPassword !== 'string' || newPassword.length < 8) throw Object.assign(new Error('Password must be ≥8 chars'), { status: 400 });
    const users = await getUsers();
    const user  = users[username];
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw Object.assign(new Error('Current password incorrect'), { status: 401 });
    users[username].password = await bcrypt.hash(newPassword, 12);
    await saveUsers(users);
    logger.info(`[Auth] Password changed for "${username}"`);
  }

  async getTotpStatus(username) {
    const users = await getUsers();
    const user  = users[username];
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    return { enabled: !!user.totpSecret, role: user.role || 'viewer' };
  }
}

module.exports = AuthService;
