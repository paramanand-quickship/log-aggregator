'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');

function authenticate (req, res, next) {
	const token = req.cookies[config.SESSION_NAME];
	if (!token) { return res.status(401).json({ error: 'Unauthorized — no session' }); }

	try {
		const decoded = jwt.verify(token, config.JWT_SECRET);
		req.user = decoded;
		next();
	} catch (err) {
		return res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
	}
}

module.exports = authenticate;
