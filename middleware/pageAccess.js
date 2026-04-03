'use strict';
const { RoleConfigService } = require('../services/RoleConfigService');
const svc = new RoleConfigService();

/**
 * Middleware factory — checks if the logged-in user's role can access pageId.
 * Must be used AFTER authenticateUI (req.user must be set).
 * On denial, redirects to /dashboard with a flash query param.
 *
 * Usage in routes/ui.js:
 *   router.get('/analytics', authenticateUI, requirePage('analytics'), ...)
 */
function requirePage (pageId) {
	return async function pageAccessMiddleware (req, res, next) {
		if (!req.user) { return res.redirect('/login'); }
		try {
			const allowed = await svc.canAccessPage(req.user.role, pageId);
			if (!allowed) { return res.redirect('/dashboard?denied=1'); }
			next();
		} catch {
			next(); // config read error → allow (fail open)
		}
	};
}

module.exports = { requirePage };
