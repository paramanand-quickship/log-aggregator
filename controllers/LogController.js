'use strict';

class LogController {
	constructor (logService) { this.svc = logService; }

	// POST /api/logs  (or POST /api/logs/bulk)
	ingest (req, res) {
		try {
			const { logs, appName } = req.body;
			if (!Array.isArray(logs)) { return res.status(400).json({ error: '"logs" must be an array' }); }
			if (!logs.length) { return res.status(400).json({ error: '"logs" must not be empty' }); }
			if (logs.length > 10_000) { return res.status(400).json({ error: 'Max 10,000 entries per request' }); }
			const written = this.svc.ingest(logs, appName || 'unknown');
			res.status(202).json({ received: written });
		} catch (err) { res.status(err.status || 500).json({ error: err.message }); }
	}

	// GET /api/logs/services
	async services (req, res) {
		try { res.json(await this.svc.getServices()); } catch (err) { res.status(500).json({ error: err.message }); }
	}

	// GET /api/logs/tail/:appName/:date
	async tail (req, res) {
		try {
			const lines = Math.min(parseInt(req.query.lines, 10) || 100, 10_000);
			const result = await this.svc.tail(req.params.appName, req.params.date, lines);
			res.json(result);
		} catch (err) { res.status(err.status || 400).json({ error: err.message }); }
	}

	// GET /api/logs/search
	async search (req, res) {
		try {
			const result = await this.svc.search(req.query);
			res.json(result);
		} catch (err) { res.status(err.status || 500).json({ error: err.message }); }
	}

	// GET /api/logs/replay?minutes=30
	async replay (req, res) {
		try {
			const result = await this.svc.replay(req.query.minutes);
			res.json({ count: result.length, logs: result });
		} catch (err) { res.status(500).json({ error: err.message }); }
	}

	// GET /api/logs/download/:appName/:date
	async download (req, res) {
		try {
			await this.svc.download(req.params.appName, req.params.date, req.query, res);
		} catch (err) { res.status(err.status || 500).json({ error: err.message }); }
	}
}

module.exports = LogController;
