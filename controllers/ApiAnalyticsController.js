'use strict';

class ApiAnalyticsController {
	constructor (apiAnalyticsService) { this.svc = apiAnalyticsService; }

	async services (req, res) {
		try { res.json(await this.svc.getApiServices()); } catch (err) { res.status(500).json({ error: err.message }); }
	}

	async overview (req, res) {
		try {
			const { service, date } = req.query;
			if (!service) { return res.status(400).json({ error: 'service required' }); }
			res.json(await this.svc.getOverview(service, date));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async hourly (req, res) {
		try {
			const { service, date } = req.query;
			if (!service) { return res.status(400).json({ error: 'service required' }); }
			res.json(await this.svc.getHourlyVolume(service, date));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async endpoints (req, res) {
		try {
			const { service, date } = req.query;
			if (!service) { return res.status(400).json({ error: 'service required' }); }
			res.json(await this.svc.getEndpointStats(service, date));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async slowest (req, res) {
		try {
			const { service, date } = req.query;
			const topN = Math.min(parseInt(req.query.top, 10) || 10, 50);
			if (!service) { return res.status(400).json({ error: 'service required' }); }
			res.json(await this.svc.getTopSlowest(service, date, topN));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async topErrors (req, res) {
		try {
			const { service, date } = req.query;
			const topN = Math.min(parseInt(req.query.top, 10) || 10, 50);
			if (!service) { return res.status(400).json({ error: 'service required' }); }
			res.json(await this.svc.getTopErrors(service, date, topN));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async statusDist (req, res) {
		try {
			const { service, date } = req.query;
			if (!service) { return res.status(400).json({ error: 'service required' }); }
			res.json(await this.svc.getStatusDistribution(service, date));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}
}

module.exports = ApiAnalyticsController;
