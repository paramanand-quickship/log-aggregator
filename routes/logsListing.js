'use strict';
const express = require('express');
const router = express.Router();
const fsP = require('fs').promises;
const path = require('path');
const config = require('../config');
const authenticate = require('../middleware/auth');
const { sanitizeAppName } = require('../lib/utils');

// GET /logs/list/:appName
router.get('/:appName', authenticate, async (req, res) => {
	let appName;
	try {
		appName = sanitizeAppName(req.params.appName);
	} catch (err) {
		return res.status(400).json({ error: err.message });
	}

	const appDir = path.join(config.LOG_BASE_DIR, appName);

	try {
		const files = await fsP.readdir(appDir);
		const logFiles = files
			.filter((f) => f.endsWith('.log'))
			.map((f) => f.replace('.log', ''))
			.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
			.sort()
			.reverse();
		res.json({ appName, logs: logFiles });
	} catch (err) {
		if (err.code === 'ENOENT') { return res.status(404).json({ error: 'Service not found' }); }
		res.status(500).json({ error: 'Could not read service logs' });
	}
});

module.exports = router;
