'use strict';
const { RoleConfigService } = require('../services/RoleConfigService');

class RoleConfigController {
	constructor () { this.svc = new RoleConfigService(); }

	async getConfig (req, res) {
		try { res.json(await this.svc.getConfig()); } catch (err) { res.status(500).json({ error: err.message }); }
	}

	async saveConfig (req, res) {
		try {
			const saved = await this.svc.saveConfig(req.body);
			res.json({ success: true, config: saved });
		} catch (err) { res.status(err.status || 500).json({ error: err.message }); }
	}
}

module.exports = RoleConfigController;
