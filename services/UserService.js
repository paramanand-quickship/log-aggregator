'use strict';
const bcrypt                  = require('bcryptjs');
const { getUsers, saveUsers } = require('../lib/userStore');
const logger                  = require('../lib/logger');

const SAFE_USER = /^[a-zA-Z0-9_.-]{2,32}$/;

class UserService {
  async getAll () {
    const users = await getUsers();
    return Object.entries(users).map(([username, u]) => ({
      username,
      role:        u.role || 'viewer',
      totpEnabled: !!u.totpSecret,
      createdAt:   u.createdAt || null,
    })).sort((a, b) => a.username.localeCompare(b.username));
  }

  async add (username, password, role = 'viewer', actorUsername) {
    if (!SAFE_USER.test(username || ''))
      throw Object.assign(new Error('Username must be 2-32 chars: letters, digits, _ . -'), { status: 400 });
    if (!password || password.length < 8)
      throw Object.assign(new Error('Password must be 8+ characters'), { status: 400 });

    const users = await getUsers();
    if (users[username]) throw Object.assign(new Error('User "' + username + '" already exists'), { status: 409 });

    users[username] = { password: await bcrypt.hash(password, 12), role, createdAt: new Date().toISOString() };
    await saveUsers(users);
    logger.info('[Users] "' + actorUsername + '" created user "' + username + '" (role: ' + role + ')');
    return { username, role, createdAt: users[username].createdAt };
  }

  async updateRole (username, newRole, actorUsername) {
    const users = await getUsers();
    if (!users[username]) throw Object.assign(new Error('User not found'), { status: 404 });
    if (username === actorUsername) throw Object.assign(new Error('Cannot change your own role'), { status: 400 });
    users[username].role = newRole;
    await saveUsers(users);
    logger.info('[Users] "' + actorUsername + '" changed "' + username + '" role to ' + newRole);
  }

  async resetPassword (username, newPassword, actorUsername) {
    if (!newPassword || newPassword.length < 8)
      throw Object.assign(new Error('Password must be 8+ characters'), { status: 400 });
    const users = await getUsers();
    if (!users[username]) throw Object.assign(new Error('User not found'), { status: 404 });
    users[username].password = await bcrypt.hash(newPassword, 12);
    await saveUsers(users);
    logger.info('[Users] "' + actorUsername + '" reset password for "' + username + '"');
  }

  async remove (username, actorUsername) {
    if (username === actorUsername) throw Object.assign(new Error('Cannot delete your own account'), { status: 400 });
    const users = await getUsers();
    if (!users[username]) throw Object.assign(new Error('User not found'), { status: 404 });
    // Guard last admin
    if (users[username].role === 'admin') {
      const admins = Object.values(users).filter(u => u.role === 'admin').length;
      if (admins <= 1) throw Object.assign(new Error('Cannot delete the last admin account'), { status: 400 });
    }
    delete users[username];
    await saveUsers(users);
    logger.info('[Users] "' + actorUsername + '" deleted user "' + username + '"');
  }

  async revoke2fa (username, actorUsername) {
    const users = await getUsers();
    if (!users[username]) throw Object.assign(new Error('User not found'), { status: 404 });
    delete users[username].totpSecret;
    await saveUsers(users);
    logger.info('[Users] "' + actorUsername + '" revoked 2FA for "' + username + '"');
  }
}
module.exports = UserService;
