'use strict';

class AnalyticsController {
	constructor (analyticsService) { this.svc = analyticsService; }

	async overview (req, res) {
		try { res.json(await this.svc.getOverview()); } catch (err) { res.status(500).json({ error: err.message }); }
	}

	async hourly (req, res) {
		try {
			const { service, date } = req.query;
			res.json(await this.svc.getHourlyVolume(service, date));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async levels (req, res) {
		try {
			const { service, date } = req.query;
			res.json(await this.svc.getLevelBreakdown(service, date));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async topServices (req, res) {
		try {
			const { date, top } = req.query;
			res.json(await this.svc.getTopServices(date, parseInt(top, 10) || 10));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async recentErrors (req, res) {
		try {
			const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
			res.json(await this.svc.getRecentErrors(limit));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	async trend (req, res) {
		try {
			const { service, days } = req.query;
			res.json(await this.svc.getDailyTrend(service, parseInt(days, 10) || 7));
		} catch (err) { res.status(500).json({ error: err.message }); }
	}
}

module.exports = AnalyticsController;
