'use strict';
const { cleanupOldLogs } = require('../lib/cleanup');
const logger = require('../lib/logger');

class SettingsController {
	constructor (settingsService) { this.svc = settingsService; }

	// GET /api/settings
	async getSettings (req, res) {
		try {
			const settings = await this.svc.get();
			res.json(settings);
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	// POST /api/settings
	async saveSettings (req, res) {
		try {
			const { retentionDays, webhookUrl, enableStream } = req.body;
			const updated = await this.svc.save({ retentionDays, webhookUrl, enableStream });
			res.json({ success: true, settings: updated });
		} catch (err) { res.status(err.status || 500).json({ error: err.message }); }
	}

	// POST /api/settings/cleanup  (admin — trigger manual cleanup run)
	async runCleanup (req, res) {
		try {
			logger.info(`[Settings] Manual cleanup triggered by "${req.user.username}"`);
			await cleanupOldLogs();
			res.json({ success: true, message: 'Cleanup completed' });
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	// POST /api/settings/reset  (admin — reset to defaults)
	async resetSettings (req, res) {
		try {
			const settings = await this.svc.reset();
			res.json({ success: true, settings });
		} catch (err) { res.status(500).json({ error: err.message }); }
	}
}

module.exports = SettingsController;
