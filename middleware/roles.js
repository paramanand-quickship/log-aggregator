'use strict';

/**
 * Require one of the specified roles.
 * Must be used AFTER authenticate middleware (req.user must be set).
 * @param {...string} roles - e.g. requireRole('admin') or requireRole('admin','viewer')
 */
function requireRole(...roles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden — requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = requireRole;
