'use strict';
const fs       = require('fs');
const fsP      = require('fs').promises;
const path     = require('path');
const readline = require('readline');
const config   = require('../config');
const { getToday, sanitizeAppName, sanitizeDate, safeLogPath, formatBytes } = require('../lib/utils');

class AnalyticsService {

  // ─── Overview dashboard stats ─────────────────────────────────────────────

  async getOverview() {
    const today    = getToday();
    let   dirs     = [];
    try { dirs = await fsP.readdir(config.LOG_BASE_DIR); } catch (e) { if (e.code !== 'ENOENT') throw e; }

    let totalToday = 0, totalErrors = 0, totalBytes = 0;
    const services = [];

    for (const app of dirs) {
      const appPath = path.join(config.LOG_BASE_DIR, app);
      try {
        const stat = await fsP.stat(appPath);
        if (!stat.isDirectory()) continue;
        const files = await fsP.readdir(appPath);
        let appBytes = 0;
        for (const f of files.filter(f => f.endsWith('.log'))) {
          try { appBytes += (await fsP.stat(path.join(appPath, f))).size; } catch {}
        }
        totalBytes += appBytes;

        // Count today's logs
        const todayFile = path.join(appPath, `${today}.log`);
        const counts    = await this._countLevels(todayFile);
        totalToday     += counts.total;
        totalErrors    += counts.error || 0;
        services.push({ appName: app, today: counts.total, error: counts.error || 0, bytes: appBytes });
      } catch {}
    }

    return {
      services:       services.length,
      logsToday:      totalToday,
      errorsToday:    totalErrors,
      errorRate:      totalToday ? ((totalErrors / totalToday) * 100).toFixed(1) : '0.0',
      totalStorage:   formatBytes(totalBytes),
      totalStorageBytes: totalBytes,
      serviceList:    services.sort((a, b) => b.today - a.today),
    };
  }

  // ─── Hourly volume for a given date ───────────────────────────────────────

  async getHourlyVolume(service, date) {
    date = date || getToday();
    try { sanitizeDate(date); } catch { return this._emptyHours(date); }

    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, total: 0, error: 0, warn: 0, info: 0, debug: 0 }));

    const processFile = async (filePath) => {
      if (!fs.existsSync(filePath)) return;
      await new Promise((resolve) => {
        const stream = fs.createReadStream(filePath, 'utf8');
        const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', line => {
          if (!line.trim()) return;
          try {
            const p    = JSON.parse(line);
            const h    = new Date(p.ts).getUTCHours();
            const lvl  = (p.level || 'info').toLowerCase();
            hours[h].total++;
            if (hours[h][lvl] !== undefined) hours[h][lvl]++;
          } catch {}
        });
        rl.on('close', resolve);
        rl.on('error', resolve);
        stream.on('error', resolve);
      });
    };

    if (service) {
      try { sanitizeAppName(service); } catch { return this._emptyHours(date); }
      await processFile(safeLogPath(config.LOG_BASE_DIR, service, date));
    } else {
      let dirs = [];
      try { dirs = await fsP.readdir(config.LOG_BASE_DIR); } catch {}
      for (const app of dirs) {
        const fp = path.join(config.LOG_BASE_DIR, app, `${date}.log`);
        await processFile(fp);
      }
    }
    return { date, service: service || 'all', hours };
  }

  // ─── Level breakdown ──────────────────────────────────────────────────────

  async getLevelBreakdown(service, date) {
    date = date || getToday();
    let filePaths = [];
    try {
      if (service) {
        sanitizeAppName(service);
        sanitizeDate(date);
        filePaths = [safeLogPath(config.LOG_BASE_DIR, service, date)];
      } else {
        sanitizeDate(date);
        let dirs = [];
        try { dirs = await fsP.readdir(config.LOG_BASE_DIR); } catch {}
        for (const app of dirs) {
          filePaths.push(path.join(config.LOG_BASE_DIR, app, `${date}.log`));
        }
      }
    } catch { return { error: 0, warn: 0, info: 0, debug: 0, total: 0 }; }

    const counts = { error: 0, warn: 0, info: 0, debug: 0, total: 0 };
    for (const fp of filePaths) {
      const c = await this._countLevels(fp);
      counts.error += c.error || 0;
      counts.warn  += c.warn  || 0;
      counts.info  += c.info  || 0;
      counts.debug += c.debug || 0;
      counts.total += c.total || 0;
    }
    return counts;
  }

  // ─── Top services by volume ───────────────────────────────────────────────

  async getTopServices(date, topN = 10) {
    date = date || getToday();
    let dirs = [];
    try { dirs = await fsP.readdir(config.LOG_BASE_DIR); } catch {}
    const results = [];
    for (const app of dirs) {
      const fp = path.join(config.LOG_BASE_DIR, app, `${date}.log`);
      const c  = await this._countLevels(fp);
      if (c.total > 0) results.push({ appName: app, ...c });
    }
    return results.sort((a, b) => b.total - a.total).slice(0, topN);
  }

  // ─── Recent errors ────────────────────────────────────────────────────────

  async getRecentErrors(limit = 20) {
    const today   = getToday();
    const errors  = [];
    let   dirs    = [];
    try { dirs = await fsP.readdir(config.LOG_BASE_DIR); } catch {}

    for (const app of dirs) {
      const fp = path.join(config.LOG_BASE_DIR, app, `${today}.log`);
      if (!fs.existsSync(fp)) continue;
      await new Promise((resolve) => {
        const stream = fs.createReadStream(fp, 'utf8');
        const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', line => {
          if (!line.trim()) return;
          try {
            const p = JSON.parse(line);
            if ((p.level || '').toLowerCase() === 'error') errors.push({ ...p, _appName: app });
          } catch {}
        });
        rl.on('close', resolve);
        rl.on('error', resolve);
        stream.on('error', resolve);
      });
    }
    return errors.sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, limit);
  }

  // ─── Multi-day trend (last N days) ───────────────────────────────────────

  async getDailyTrend(service, days = 7) {
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const breakdown = await this.getLevelBreakdown(service, date);
      trend.push({ date, ...breakdown });
    }
    return trend;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  async _countLevels(filePath) {
    const counts = { error: 0, warn: 0, info: 0, debug: 0, total: 0 };
    if (!fs.existsSync(filePath)) return counts;
    return new Promise((resolve) => {
      const stream = fs.createReadStream(filePath, 'utf8');
      const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
      rl.on('line', line => {
        if (!line.trim()) return;
        counts.total++;
        try {
          const lvl = (JSON.parse(line).level || 'info').toLowerCase();
          if (counts[lvl] !== undefined) counts[lvl]++;
        } catch { counts.info++; }
      });
      rl.on('close',  () => resolve(counts));
      rl.on('error',  () => resolve(counts));
      stream.on('error', () => resolve(counts));
    });
  }

  _emptyHours(date) {
    return { date, service: 'all', hours: Array.from({ length: 24 }, (_, i) => ({ hour: i, total: 0, error: 0, warn: 0, info: 0, debug: 0 })) };
  }
}

module.exports = AnalyticsService;
