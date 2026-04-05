'use strict';
const { RoleConfigService } = require('../services/RoleConfigService');
const svc = new RoleConfigService();

function requirePage(pageId) {
  return async function pageAccessMiddleware(req, res, next) {
    if (!req.user) return res.redirect('/login');
    try {
      const ok = await svc.canAccessPage(req.user.role, pageId);
      if (!ok) return res.redirect('/dashboard?denied=1');
      next();
    } catch { next(); }
  };
}
module.exports = { requirePage };
