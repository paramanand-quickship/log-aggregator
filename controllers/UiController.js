'use strict';
const fsP    = require('fs').promises;
const config = require('../config');
const { getToday } = require('../lib/utils');

class UiController {
  constructor(logService, analyticsService) {
    this.logs      = logService;
    this.analytics = analyticsService;
  }

  // ── Base props: allowedPages + allowedCards injected into every render ───
  async _base(req, extra={}) {
    try {
      const { RoleConfigService } = require('../services/RoleConfigService');
      const rc = new RoleConfigService();
      const role = req.user?.role || 'viewer';
      const [allowedPages, allowedCards] = await Promise.all([
        rc.getAllowedPages(role),
        rc.getAllowedCards(role),
      ]);
      return { user: req.user, allowedPages, allowedCards, ...extra };
    } catch {
      return { user: req.user, allowedPages: null, allowedCards: [], ...extra };
    }
  }

  loginPage(req, res) { res.render('login', { title: 'Login', error: null }); }

  async dashboard(req, res) {
    try {
      const [overview, hourly, errors] = await Promise.all([
        this.analytics.getOverview(),
        this.analytics.getHourlyVolume(null, getToday()),
        this.analytics.getRecentErrors(10),
      ]);
      const bp = await this._base(req);
      res.render('dashboard', { ...bp, title:'Dashboard', overview, hourly, errors, today:getToday() });
    } catch(err) {
      const bp = await this._base(req);
      res.render('dashboard', { ...bp, title:'Dashboard', overview:null, hourly:null, errors:[], today:getToday(), renderError:err.message });
    }
  }

  async logsPage(req, res) {
    try {
      const services = await this.logs.getServices();
      const { service, date, level, q } = req.query;
      const results = (service && date) ? await this.logs.tail(service, date, 200) : null;
      const bp = await this._base(req);
      res.render('logs', { ...bp, title:'Logs', services, selected:{service:service||'',date:date||getToday(),level:level||'',q:q||''}, results, today:getToday() });
    } catch(err) {
      const bp = await this._base(req);
      res.render('logs', { ...bp, title:'Logs', services:[], selected:{}, results:null, today:getToday(), renderError:err.message });
    }
  }

  async livePage(req, res) {
    try {
      const services = await this.logs.getServices();
      const bp = await this._base(req);
      res.render('live', { ...bp, title:'Live Stream', services });
    } catch {
      const bp = await this._base(req);
      res.render('live', { ...bp, title:'Live Stream', services:[] });
    }
  }

  async insightsPage(req, res) {
    try {
      const { service, date } = req.query;
      const today   = getToday();
      const selDate = date || today;
      const ApiAnalyticsService = require('../services/ApiAnalyticsService');
      const [logServices, apiServicesList, hourly, breakdown, topSvcs, trend] = await Promise.all([
        this.logs.getServices(),
        new ApiAnalyticsService().getApiServices().catch(()=>[]),
        this.analytics.getHourlyVolume(service||null, selDate),
        this.analytics.getLevelBreakdown(service||null, selDate),
        this.analytics.getTopServices(selDate, 10),
        this.analytics.getDailyTrend(service||null, 7),
      ]);
      const bp = await this._base(req);
      res.render('insights', { ...bp, title:'Insights', logServices, apiServices:apiServicesList, selected:{service:service||'',date:selDate}, hourly, breakdown, topSvcs, trend, today });
    } catch(err) {
      const bp = await this._base(req);
      res.render('insights', { ...bp, title:'Insights', logServices:[], apiServices:[], selected:{}, hourly:null, breakdown:null, topSvcs:[], trend:[], today:getToday(), renderError:err.message });
    }
  }

  async healthPage(req, res) {
    try {
      const mem  = process.memoryUsage();
      const cpu  = process.cpuUsage();
      const upSec = Math.floor(process.uptime());
      let logDirOk=true; try{await fsP.access(config.LOG_BASE_DIR);}catch{logDirOk=false;}
      let overview=null; try{overview=await this.analytics.getOverview();}catch{}
      const bp = await this._base(req);
      res.render('health', { ...bp, title:'Health',
        status: logDirOk?'ok':'degraded',
        timestamp: new Date().toISOString(),
        uptimeHuman: Math.floor(upSec/3600)+'h '+Math.floor((upSec%3600)/60)+'m '+(upSec%60)+'s',
        uptimeSec: upSec,
        memory: { rss:Math.round(mem.rss/1048576), heapUsed:Math.round(mem.heapUsed/1048576), heapTotal:Math.round(mem.heapTotal/1048576), external:Math.round((mem.external||0)/1048576) },
        cpu: { user:(cpu.user/1e6).toFixed(3), system:(cpu.system/1e6).toFixed(3) },
        proc: { version:process.version, pid:process.pid, platform:process.platform, arch:process.arch, cwd:process.cwd(), env:config.NODE_ENV },
        checks: { logDir:logDirOk?'ok':'missing', stream:config.ENABLE_STREAM?'enabled':'disabled' },
        cfg: { port:config.PORT, logBaseDir:config.LOG_BASE_DIR, dataDir:config.DATA_DIR, retentionDays:config.RETENTION_DAYS, batchSize:config.BATCH_SIZE, batchTimeout:config.BATCH_TIMEOUT, maxBodySize:config.MAX_BODY_SIZE, enableStream:config.ENABLE_STREAM, corsOrigins:config.CORS_ORIGINS, webhookUrl:config.WEBHOOK_URL?'(configured)':'(not set)' },
        overview,
      });
    } catch(err) { res.status(500).render('404',{title:'Error',user:req.user||null}); }
  }

  async settingsPage(req, res) {
    try {
      const SettingsService = require('../services/SettingsService');
      const AuthService     = require('../services/AuthService');
      const [settings, totpStatus] = await Promise.all([new SettingsService().get(), new AuthService().getTotpStatus(req.user.username)]);
      const bp = await this._base(req);
      res.render('settings', { ...bp, title:'Settings', isAdmin:req.user.role==='admin', settings, totpEnabled:totpStatus.enabled });
    } catch(err) { res.status(500).render('404',{title:'Error',user:req.user||null}); }
  }

  async usersPage(req, res) {
    try {
      const UserService = require('../services/UserService');
      const { RoleConfigService } = require('../services/RoleConfigService');
      const [users, rolesData] = await Promise.all([new UserService().getAll(), new RoleConfigService().getRoles()]);
      const bp = await this._base(req);
      res.render('users', { ...bp, title:'Users', users, roles:Object.keys(rolesData), rolesData });
    } catch(err) { res.status(500).render('404',{title:'Error',user:req.user||null}); }
  }

  async apiKeysPage(req, res) {
    try {
      const ApiKeyService = require('../services/ApiKeyService');
      const keys = await new ApiKeyService().list();
      const bp   = await this._base(req);
      const SCOPES = ['logs:write','logs:read','analytics:read','health:read','stream:read'];
      res.render('api-keys', { ...bp, title:'API Keys', keys, SCOPES });
    } catch(err) { res.status(500).render('404',{title:'Error',user:req.user||null}); }
  }

  async rolesPage(req, res) {
    try {
      const { RoleConfigService, ALL_PAGES, ALL_CARDS } = require('../services/RoleConfigService');
      const rcSvc = new RoleConfigService();
      const rolesData = await rcSvc.getRoles();
      const bp = await this._base(req);
      res.render('roles', { ...bp, title:'Role Config', rolesData, allPages:ALL_PAGES, allCards:ALL_CARDS });
    } catch(err) { res.status(500).render('404',{title:'Error',user:req.user||null}); }
  }
}
module.exports = UiController;
