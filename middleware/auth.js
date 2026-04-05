'use strict';
const jwt    = require('jsonwebtoken');
const config = require('../config');

function authenticate (req, res, next) {
  const token = req.cookies[config.SESSION_NAME];
  if (!token) return res.status(401).json({ error: 'Unauthorized — no session' });
  try { req.user = jwt.verify(token, config.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Unauthorized — invalid or expired token' }); }
}

function authenticateUI (req, res, next) {
  const token = req.cookies[config.SESSION_NAME];
  if (!token) return res.redirect('/login');
  try { req.user = jwt.verify(token, config.JWT_SECRET); next(); }
  catch { res.redirect('/login'); }
}

module.exports = { authenticate, authenticateUI };
