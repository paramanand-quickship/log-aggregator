'use strict';
function rateLimit({ windowMs = 60_000, max = 60, message = 'Too many requests' } = {}) {
  const store = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of store) {
      const fresh = times.filter(t => now - t < windowMs);
      if (!fresh.length) store.delete(ip); else store.set(ip, fresh);
    }
  }, windowMs).unref();

  return function rateLimitMiddleware(req, res, next) {
    const ip   = req.ip || 'unknown';
    const now  = Date.now();
    const hits = (store.get(ip) || []).filter(t => now - t < windowMs);
    hits.push(now);
    store.set(ip, hits);
    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - hits.length));
    if (hits.length > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
module.exports = rateLimit;
