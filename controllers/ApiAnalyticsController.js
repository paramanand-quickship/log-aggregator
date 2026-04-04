'use strict';

class ApiAnalyticsController {
  constructor (apiAnalyticsService) { this.svc = apiAnalyticsService; }

  async services (req, res) {
    try { res.json(await this.svc.getApiServices()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  }

  async overview (req, res) {
    try {
      const { service, date } = req.query;
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getOverview(service, date));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async hourly (req, res) {
    try {
      const { service, date } = req.query;
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getHourlyVolume(service, date));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async endpoints (req, res) {
    try {
      const { service, date } = req.query;
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getEndpointStats(service, date));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async slowest (req, res) {
    try {
      const { service, date } = req.query;
      const topN = Math.min(parseInt(req.query.top, 10) || 10, 50);
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getTopSlowest(service, date, topN));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async topErrors (req, res) {
    try {
      const { service, date } = req.query;
      const topN = Math.min(parseInt(req.query.top, 10) || 10, 50);
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getTopErrors(service, date, topN));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async statusDist (req, res) {
    try {
      const { service, date } = req.query;
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getStatusDistribution(service, date));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
  async apdex (req, res) {
    try {
      const { service, date } = req.query;
      const tMs = parseInt(req.query.t, 10) || 200;
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getApdex(service, date, tMs));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async trend (req, res) {
    try {
      const { service } = req.query;
      const days = Math.min(parseInt(req.query.days, 10) || 7, 30);
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getDailyTrend(service, days));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async heaviest (req, res) {
    try {
      const { service, date } = req.query;
      const topN = Math.min(parseInt(req.query.top, 10) || 10, 50);
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getTopHeaviest(service, date, topN));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async individualSlowest (req, res) {
    try {
      const { service, date } = req.query;
      const topN = Math.min(parseInt(req.query.top, 10) || 20, 100);
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getIndividualSlowest(service, date, topN));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async peakRpm (req, res) {
    try {
      const { service, date } = req.query;
      if (!service) return res.status(400).json({ error: 'service required' });
      res.json(await this.svc.getPeakRpm(service, date));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async slowTrend (req, res) {
    try {
      const { service, start, end } = req.query;
      if (!service || !start || !end) return res.status(400).json({ error: 'service, start, end required' });
      res.json(await this.svc.getSlowTrend(service, start, end));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async errorTrend (req, res) {
    try {
      const { service, start, end } = req.query;
      if (!service || !start || !end) return res.status(400).json({ error: 'service, start, end required' });
      res.json(await this.svc.getErrorTrend(service, start, end));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

  async hourlyPattern (req, res) {
    try {
      const { service, start, end } = req.query;
      if (!service || !start || !end) return res.status(400).json({ error: 'service, start, end required' });
      res.json(await this.svc.getHourlySlowPattern(service, start, end));
    } catch (err) { res.status(500).json({ error: err.message }); }
  }

}

module.exports = ApiAnalyticsController;
