'use strict';
const { getToday } = require('../lib/utils');

class UiController {
  constructor(logService, analyticsService) {
    this.logs      = logService;
    this.analytics = analyticsService;
  }

  loginPage(req, res) {
    res.render('login', { title: 'Login', error: null });
  }

  async dashboard(req, res) {
    try {
      const overview = await this.analytics.getOverview();
      const hourly   = await this.analytics.getHourlyVolume(null, getToday());
      const errors   = await this.analytics.getRecentErrors(10);
      res.render('dashboard', {
        title:    'Dashboard',
        user:     req.user,
        overview,
        hourly,
        errors,
        today:    getToday(),
      });
    } catch (err) {
      res.render('dashboard', { title: 'Dashboard', user: req.user, overview: null, hourly: null, errors: [], today: getToday(), renderError: err.message });
    }
  }

  async logsPage(req, res) {
    try {
      const services = await this.logs.getServices();
      const { service, date, level, q } = req.query;
      let results = null;
      if (service && date) {
        results = await this.logs.tail(service, date, 200);
      }
      res.render('logs', {
        title:    'Logs',
        user:     req.user,
        services,
        selected: { service: service || '', date: date || getToday(), level: level || '', q: q || '' },
        results,
        today:    getToday(),
      });
    } catch (err) {
      res.render('logs', { title: 'Logs', user: req.user, services: [], selected: {}, results: null, today: getToday(), renderError: err.message });
    }
  }

  async livePage(req, res) {
    try {
      const services = await this.logs.getServices();
      res.render('live', { title: 'Live Stream', user: req.user, services });
    } catch {
      res.render('live', { title: 'Live Stream', user: req.user, services: [] });
    }
  }

  async analyticsPage(req, res) {
    try {
      const services   = await this.logs.getServices();
      const { service, date } = req.query;
      const today      = getToday();
      const selDate    = date || today;
      const hourly     = await this.analytics.getHourlyVolume(service || null, selDate);
      const breakdown  = await this.analytics.getLevelBreakdown(service || null, selDate);
      const topSvcs    = await this.analytics.getTopServices(selDate, 10);
      const trend      = await this.analytics.getDailyTrend(service || null, 7);
      res.render('analytics', {
        title: 'Analytics',
        user:  req.user,
        services,
        selected: { service: service || '', date: selDate },
        hourly,
        breakdown,
        topSvcs,
        trend,
        today,
      });
    } catch (err) {
      res.render('analytics', { title: 'Analytics', user: req.user, services: [], selected: {}, hourly: null, breakdown: null, topSvcs: [], trend: [], today: getToday(), renderError: err.message });
    }
  }
}

module.exports = UiController;
