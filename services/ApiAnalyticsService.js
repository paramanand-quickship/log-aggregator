'use strict';
const fs       = require('fs');
const fsP      = require('fs').promises;
const path     = require('path');
const readline = require('readline');
const config   = require('../config');
const { getToday, sanitizeAppName, sanitizeDate, formatBytes } = require('../lib/utils');

class ApiAnalyticsService {

  // ─── List services that have request logs ─────────────────────────────────

  async getApiServices () {
    let dirs = [];
    try { dirs = await fsP.readdir(config.LOG_BASE_DIR); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const results = [];
    for (const dir of dirs) {
      if (!dir.endsWith('-requests')) continue;
      const fullPath = path.join(config.LOG_BASE_DIR, dir);
      try {
        const stat = await fsP.stat(fullPath);
        if (!stat.isDirectory()) continue;
        // Derive the base appName (strip '-requests')
        const baseApp = dir.slice(0, -('-requests'.length));
        results.push({ appName: dir, baseApp, dir: fullPath });
      } catch {}
    }
    return results;
  }

  // ─── Parse all api_request entries for a service+date ───────────────────

  async _parseRequestLogs (appName, date) {
    const safeApp  = sanitizeAppName(appName);
    const safeDate = sanitizeDate(date);
    const filePath = path.join(config.LOG_BASE_DIR, safeApp, `${safeDate}.log`);
    const entries  = [];

    if (!fs.existsSync(filePath)) return entries;

    await new Promise((resolve) => {
      const stream = fs.createReadStream(filePath, 'utf8');
      const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
      rl.on('line', line => {
        if (!line.trim()) return;
        try {
          const p = JSON.parse(line);
          if (p.type === 'api_request' && p.method && p.path) entries.push(p);
        } catch {}
      });
      rl.on('close', resolve);
      rl.on('error', resolve);
      stream.on('error', resolve);
    });

    return entries;
  }

  // ─── Compute per-endpoint stats ──────────────────────────────────────────

  _computeEndpointStats (entries) {
    const map = new Map();

    for (const e of entries) {
      const key = `${e.method} ${e.path}`;
      if (!map.has(key)) {
        map.set(key, {
          method:        e.method,
          path:          e.path,
          count:         0,
          durations:     [],
          totalReqBytes: 0,
          totalResBytes: 0,
          errors:        0,     // 4xx + 5xx
          errors5xx:     0,
          statusCodes:   {},
          lastSeen:      null,
        });
      }
      const s = map.get(key);
      s.count++;
      s.durations.push(e.durationMs || 0);
      s.totalReqBytes += e.reqSizeBytes || 0;
      s.totalResBytes += e.resSizeBytes || 0;
      if (e.statusCode >= 400) s.errors++;
      if (e.statusCode >= 500) s.errors5xx++;
      s.statusCodes[e.statusCode] = (s.statusCodes[e.statusCode] || 0) + 1;
      if (!s.lastSeen || e.ts > s.lastSeen) s.lastSeen = e.ts;
    }

    const results = [];
    for (const s of map.values()) {
      const sorted  = [...s.durations].sort((a, b) => a - b);
      const total   = sorted.reduce((a, b) => a + b, 0);
      const avg     = s.count ? total / s.count : 0;
      const p95idx  = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
      const p99idx  = Math.max(0, Math.ceil(sorted.length * 0.99) - 1);

      results.push({
        method:        s.method,
        path:          s.path,
        count:         s.count,
        avgDuration:   Math.round(avg * 10) / 10,
        p95Duration:   sorted[p95idx] || 0,
        p99Duration:   sorted[p99idx] || 0,
        maxDuration:   sorted[sorted.length - 1] || 0,
        minDuration:   sorted[0] || 0,
        avgReqBytes:   s.count ? Math.round(s.totalReqBytes / s.count) : 0,
        avgResBytes:   s.count ? Math.round(s.totalResBytes / s.count) : 0,
        totalReqBytes: s.totalReqBytes,
        totalResBytes: s.totalResBytes,
        errors:        s.errors,
        errors5xx:     s.errors5xx,
        errorRate:     s.count ? ((s.errors / s.count) * 100).toFixed(1) : '0.0',
        statusCodes:   s.statusCodes,
        lastSeen:      s.lastSeen,
      });
    }
    return results;
  }

  // ─── Overview stats card ─────────────────────────────────────────────────

  async getOverview (appName, date) {
    date = date || getToday();
    const entries = await this._parseRequestLogs(appName, date);
    if (!entries.length) return this._emptyOverview(date);

    const totalRequests = entries.length;
    const totalErrors   = entries.filter(e => e.statusCode >= 400).length;
    const totalErrors5xx = entries.filter(e => e.statusCode >= 500).length;
    const avgDuration   = entries.reduce((a, e) => a + (e.durationMs || 0), 0) / totalRequests;
    const maxDuration   = Math.max(...entries.map(e => e.durationMs || 0));
    const totalReqBytes = entries.reduce((a, e) => a + (e.reqSizeBytes || 0), 0);
    const totalResBytes = entries.reduce((a, e) => a + (e.resSizeBytes || 0), 0);

    return {
      date,
      appName,
      totalRequests,
      totalErrors,
      totalErrors5xx,
      errorRate:    totalRequests ? ((totalErrors / totalRequests) * 100).toFixed(1) : '0.0',
      errorRate5xx: totalRequests ? ((totalErrors5xx / totalRequests) * 100).toFixed(1) : '0.0',
      avgDuration:  Math.round(avgDuration * 10) / 10,
      maxDuration,
      totalReqBytes,
      totalResBytes,
      totalDataHuman: formatBytes(totalReqBytes + totalResBytes),
      totalResHuman:  formatBytes(totalResBytes),
      totalReqHuman:  formatBytes(totalReqBytes),
    };
  }

  _emptyOverview (date) {
    return {
      date, totalRequests: 0, totalErrors: 0, totalErrors5xx: 0,
      errorRate: '0.0', errorRate5xx: '0.0', avgDuration: 0, maxDuration: 0,
      totalReqBytes: 0, totalResBytes: 0, totalDataHuman: '0 B',
      totalResHuman: '0 B', totalReqHuman: '0 B',
    };
  }

  // ─── Hourly breakdown ────────────────────────────────────────────────────

  async getHourlyVolume (appName, date) {
    date = date || getToday();
    const entries = await this._parseRequestLogs(appName, date);
    const hours   = Array.from({ length: 24 }, (_, i) => ({
      hour: i, total: 0, ok: 0, warn: 0, error: 0, avgDuration: 0, _durations: [],
    }));

    for (const e of entries) {
      const h = new Date(e.ts).getUTCHours();
      hours[h].total++;
      hours[h]._durations.push(e.durationMs || 0);
      if (e.statusCode >= 500)      hours[h].error++;
      else if (e.statusCode >= 400) hours[h].warn++;
      else                          hours[h].ok++;
    }

    for (const h of hours) {
      if (h._durations.length) {
        h.avgDuration = Math.round(h._durations.reduce((a, b) => a + b, 0) / h._durations.length);
      }
      delete h._durations;
    }

    return { date, appName, hours };
  }

  // ─── All endpoint stats ───────────────────────────────────────────────────

  async getEndpointStats (appName, date) {
    date = date || getToday();
    const entries = await this._parseRequestLogs(appName, date);
    return this._computeEndpointStats(entries);
  }

  // ─── Top slowest endpoints ────────────────────────────────────────────────

  async getTopSlowest (appName, date, topN = 10) {
    const stats = await this.getEndpointStats(appName, date);
    return stats
      .filter(s => s.count >= 1)
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, topN);
  }

  // ─── Most errored endpoints ───────────────────────────────────────────────

  async getTopErrors (appName, date, topN = 10) {
    const stats = await this.getEndpointStats(appName, date);
    return stats
      .filter(s => s.errors > 0)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, topN);
  }

  // ─── Highest volume endpoints ─────────────────────────────────────────────

  async getTopVolume (appName, date, topN = 10) {
    const stats = await this.getEndpointStats(appName, date);
    return stats
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }

  // ─── Status code distribution ─────────────────────────────────────────────

  async getStatusDistribution (appName, date) {
    date = date || getToday();
    const entries = await this._parseRequestLogs(appName, date);
    const dist = {};
    for (const e of entries) {
      const bucket = Math.floor(e.statusCode / 100) * 100;
      dist[bucket] = (dist[bucket] || 0) + 1;
    }
    return { date, appName, distribution: dist, total: entries.length };
  }

  // ─── Apdex score ──────────────────────────────────────────────────────────
  // Satisfied < 200ms, Tolerating < 800ms, Frustrated ≥ 800ms
  async getApdex (appName, date, tMs = 200) {
    date = date || getToday();
    const entries = await this._parseRequestLogs(appName, date);
    if (!entries.length) return { score: null, satisfied: 0, tolerating: 0, frustrated: 0, total: 0, tMs };
    let satisfied = 0, tolerating = 0, frustrated = 0;
    for (const e of entries) {
      const d = e.durationMs || 0;
      if (d <= tMs)       satisfied++;
      else if (d <= tMs * 4) tolerating++;
      else                frustrated++;
    }
    const total = entries.length;
    const score = Math.round(((satisfied + tolerating / 2) / total) * 100) / 100;
    return { score, satisfied, tolerating, frustrated, total, tMs };
  }

  // ─── 7-day duration trend ─────────────────────────────────────────────────
  async getDailyTrend (appName, days = 7) {
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const ov   = await this.getOverview(appName, date).catch(() => null);
      trend.push({
        date,
        total:       ov?.totalRequests  || 0,
        avgDuration: ov?.avgDuration    || 0,
        errorRate:   parseFloat(ov?.errorRate || '0'),
        maxDuration: ov?.maxDuration    || 0,
      });
    }
    return trend;
  }

  // ─── Top heaviest responses ───────────────────────────────────────────────
  async getTopHeaviest (appName, date, topN = 10) {
    const stats = await this.getEndpointStats(appName, date);
    return stats
      .filter(s => s.avgResBytes > 0)
      .sort((a, b) => b.avgResBytes - a.avgResBytes)
      .slice(0, topN);
  }

  // ─── Individual slowest requests (not averages — actual worst calls) ──────
  async getIndividualSlowest (appName, date, topN = 20) {
    date = date || getToday();
    const entries = await this._parseRequestLogs(appName, date);
    return entries
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, topN)
      .map(e => ({
        ts:           e.ts,
        method:       e.method,
        path:         e.path,
        statusCode:   e.statusCode,
        durationMs:   e.durationMs,
        reqSizeBytes: e.reqSizeBytes,
        resSizeBytes: e.resSizeBytes,
        requestId:    e.requestId,
      }));
  }

  // ─── RPS: peak requests-per-minute from hourly data ──────────────────────
  async getPeakRpm (appName, date) {
    const { hours } = await this.getHourlyVolume(appName, date);
    const peak = hours.reduce((max, h) => h.total > max.total ? h : max, { hour: 0, total: 0 });
    return {
      peakHour:  peak.hour,
      peakTotal: peak.total,
      peakRpm:   Math.round(peak.total / 60 * 10) / 10,
    };
  }

  // ─── Date range helper ────────────────────────────────────────────────────

  _dateRange (startDate, endDate) {
    const dates = [];
    try {
      const cur = new Date(startDate + 'T00:00:00Z');
      const end = new Date(endDate   + 'T00:00:00Z');
      let i = 0;
      while (cur <= end && i < 90) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
        i++;
      }
    } catch {}
    return dates;
  }

  // ─── Slow-trend: avg/P95 per day over a date range ───────────────────────

  async getSlowTrend (appName, startDate, endDate) {
    const dates = this._dateRange(startDate, endDate);
    const trend = [];

    for (const date of dates) {
      try { sanitizeDate(date); } catch { continue; }
      const entries = await this._parseRequestLogs(appName, date);

      if (!entries.length) {
        trend.push({ date, avgDuration: 0, p95Duration: 0, totalRequests: 0, slowestPath: '', slowestAvg: 0 });
        continue;
      }

      const sorted  = entries.map(e => e.durationMs || 0).sort((a, b) => a - b);
      const avg     = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p95idx  = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);

      // Slowest endpoint this day
      const epMap = {};
      for (const e of entries) {
        if (!epMap[e.path]) epMap[e.path] = [];
        epMap[e.path].push(e.durationMs || 0);
      }
      let slowestPath = '', slowestAvg = 0;
      for (const [path, durs] of Object.entries(epMap)) {
        const epAvg = durs.reduce((a, b) => a + b, 0) / durs.length;
        if (epAvg > slowestAvg) { slowestAvg = epAvg; slowestPath = path; }
      }

      trend.push({
        date,
        avgDuration:   Math.round(avg * 10) / 10,
        p95Duration:   sorted[p95idx] || 0,
        totalRequests: entries.length,
        slowestPath,
        slowestAvg:    Math.round(slowestAvg),
      });
    }
    return trend;
  }

  // ─── Error-trend: error rate per day over a date range ───────────────────

  async getErrorTrend (appName, startDate, endDate) {
    const dates = this._dateRange(startDate, endDate);
    const trend = [];

    for (const date of dates) {
      try { sanitizeDate(date); } catch { continue; }
      const entries  = await this._parseRequestLogs(appName, date);
      const total    = entries.length;
      const errors   = entries.filter(e => e.statusCode >= 400).length;
      const e5xx     = entries.filter(e => e.statusCode >= 500).length;

      // Top error endpoint this day
      const epErr = {};
      for (const e of entries) {
        if (e.statusCode >= 400) epErr[e.path] = (epErr[e.path] || 0) + 1;
      }
      const topErrPath = Object.entries(epErr).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      trend.push({
        date,
        totalRequests: total,
        errors,
        errors5xx:     e5xx,
        errorRate:     total ? ((errors   / total) * 100).toFixed(1) : '0.0',
        errorRate5xx:  total ? ((e5xx     / total) * 100).toFixed(1) : '0.0',
        topErrPath,
      });
    }
    return trend;
  }

  // ─── Hourly slowness pattern across a date range ──────────────────────────
  // Returns avg duration per hour-of-day (UTC) aggregated across all selected dates.
  // Useful for answering "which hour is my API always slowest?"

  async getHourlySlowPattern (appName, startDate, endDate) {
    const dates      = this._dateRange(startDate, endDate);
    const buckets    = Array.from({ length: 24 }, () => ({ durs: [], count: 0 }));

    for (const date of dates) {
      try { sanitizeDate(date); } catch { continue; }
      const entries = await this._parseRequestLogs(appName, date);
      for (const e of entries) {
        const h = new Date(e.ts).getUTCHours();
        buckets[h].durs.push(e.durationMs || 0);
        buckets[h].count++;
      }
    }

    const max = Math.max(...buckets.map(b => b.durs.length
      ? b.durs.reduce((a, x) => a + x, 0) / b.durs.length : 0), 1);

    return buckets.map((b, hour) => {
      const avg = b.durs.length ? b.durs.reduce((a, x) => a + x, 0) / b.durs.length : 0;
      return {
        hour,
        avgDuration: Math.round(avg * 10) / 10,
        count:       b.count,
        intensity:   Math.round((avg / max) * 100), // 0–100 for heatmap colouring
      };
    });
  }

}

module.exports = ApiAnalyticsService;
