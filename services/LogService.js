'use strict';
const fs       = require('fs');
const fsP      = require('fs').promises;
const path     = require('path');
const readline = require('readline');
const config   = require('../config');
const emitter  = require('../lib/emitter');
const logger   = require('../lib/logger');
const { getToday, sanitizeAppName, sanitizeDate, safeLogPath, ensureDir, formatBytes } = require('../lib/utils');

class LogService {
  constructor(batchWriter) {
    this.batchWriter = batchWriter;
  }

  // ─── Ingest ──────────────────────────────────────────────────────────────

  /**
   * Normalise and ingest an array of raw log strings.
   * Emits each log on the SSE emitter.
   */
  ingest(rawLogs, defaultAppName = 'unknown') {
    const today   = getToday();
    let   written = 0;

    for (let i = 0; i < rawLogs.length; i++) {
      const raw = rawLogs[i];
      if (typeof raw !== 'string') throw Object.assign(new TypeError(`logs[${i}] must be a string`), { status: 400 });
      if (raw.length > 64_000)    throw Object.assign(new RangeError(`logs[${i}] exceeds 64 KB`),     { status: 400 });

      // Resolve appName from JSON body > param > 'unknown'
      let appName = defaultAppName;
      let parsed  = null;
      try { parsed = JSON.parse(raw); if (parsed?.appName) appName = parsed.appName; } catch {}
      try { appName = sanitizeAppName(appName); } catch { appName = 'unknown'; }

      // Ensure structured JSON format on disk
      const structured = parsed
        ? JSON.stringify({ ts: parsed.ts || new Date().toISOString(), level: (parsed.level || 'info').toLowerCase(), appName, ...parsed })
        : JSON.stringify({ ts: new Date().toISOString(), level: 'info', appName, message: raw });

      this.batchWriter.write(appName, today, structured);

      // Alert on error level
      const level = parsed?.level?.toLowerCase();
      if (level === 'error' && config.WEBHOOK_URL) {
        this._fireWebhook(structured).catch(err => logger.warn(`[Alert] Webhook failed: ${err.message}`));
      }

      if (config.ENABLE_STREAM) {
        emitter.emit('log', structured);
      }
      written++;
    }
    return written;
  }

  async _fireWebhook(logStr) {
    const axios = require('axios');
    await axios.post(config.WEBHOOK_URL, { alert: 'error_log', log: JSON.parse(logStr) }, { timeout: 5000 });
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  async getServices() {
    let dirs = [];
    try { dirs = await fsP.readdir(config.LOG_BASE_DIR); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const results = [];
    for (const app of dirs) {
      const appPath = path.join(config.LOG_BASE_DIR, app);
      try {
        const stat = await fsP.stat(appPath);
        if (!stat.isDirectory()) continue;
        const files = await fsP.readdir(appPath);
        const dates = files.filter(f => /^\d{4}-\d{2}-\d{2}\.log$/.test(f)).map(f => f.slice(0, 10)).sort().reverse();
        let bytes = 0;
        for (const f of files.filter(f => f.endsWith('.log'))) {
          try { bytes += (await fsP.stat(path.join(appPath, f))).size; } catch {}
        }
        results.push({ appName: app, dates, bytes, bytesHuman: formatBytes(bytes) });
      } catch {}
    }
    return results;
  }

  // ─── Tail ─────────────────────────────────────────────────────────────────

  async tail(appName, date, lines = 100) {
    appName = sanitizeAppName(appName);
    date    = sanitizeDate(date);
    const filePath = safeLogPath(config.LOG_BASE_DIR, appName, date);
    if (!fs.existsSync(filePath)) return { appName, date, lines: [] };

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, 'utf8');
      const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
      const buffer = [];
      rl.on('line', l => { if (l.trim()) { buffer.push(l); if (buffer.length > lines) buffer.shift(); } });
      rl.on('close', () => resolve({ appName, date, lines: buffer }));
      rl.on('error', reject);
      stream.on('error', reject);
    });
  }

  // ─── Search ───────────────────────────────────────────────────────────────

  /**
   * Search log files.
   * @param {object} opts - { service, level, q, date, limit, offset }
   */
  async search({ service, level, q, date, limit = 500, offset = 0 }) {
    limit  = Math.min(parseInt(limit, 10) || 500, 5000);
    offset = Math.max(parseInt(offset, 10) || 0, 0);

    // Determine which files to search
    const filesToSearch = await this._resolveFiles(service, date);
    const matches       = [];
    let   scanned       = 0;
    let   skipped       = 0;

    for (const { appName: svc, filePath } of filesToSearch) {
      if (!fs.existsSync(filePath)) continue;
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, 'utf8');
        const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', line => {
          if (!line.trim()) return;
          scanned++;
          try {
            const parsed = JSON.parse(line);
            if (level && parsed.level !== level) return;
            if (q && !line.toLowerCase().includes(q.toLowerCase())) return;
            if (skipped < offset) { skipped++; return; }
            if (matches.length < limit) matches.push({ ...parsed, _appName: svc });
          } catch {
            if (q && !line.toLowerCase().includes(q.toLowerCase())) return;
            if (skipped < offset) { skipped++; return; }
            if (matches.length < limit) matches.push({ _raw: line, _appName: svc });
          }
        });
        rl.on('close', resolve);
        rl.on('error', reject);
        stream.on('error', reject);
      });
      if (matches.length >= limit) break;
    }
    return { matches, total: matches.length, scanned, offset, limit };
  }

  // ─── Replay ───────────────────────────────────────────────────────────────

  /** Return logs written in the last `minutes` minutes across all services */
  async replay(minutes = 30) {
    minutes       = Math.min(parseInt(minutes, 10) || 30, 1440);
    const cutoff  = new Date(Date.now() - minutes * 60_000);
    const today   = getToday();
    const results = [];

    const services = await this.getServices();
    for (const { appName } of services) {
      const filePath = safeLogPath(config.LOG_BASE_DIR, appName, today);
      if (!fs.existsSync(filePath)) continue;
      await new Promise((resolve) => {
        const stream = fs.createReadStream(filePath, 'utf8');
        const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', line => {
          if (!line.trim()) return;
          try {
            const parsed = JSON.parse(line);
            if (new Date(parsed.ts) >= cutoff) results.push({ ...parsed, _appName: appName });
          } catch {}
        });
        rl.on('close', resolve);
        rl.on('error', resolve);
        stream.on('error', resolve);
      });
    }
    results.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    return results;
  }

  // ─── Download (streamed, filtered) ───────────────────────────────────────

  async download(appName, date, filters, res) {
    appName = sanitizeAppName(appName);
    date    = sanitizeDate(date);
    const filePath = safeLogPath(config.LOG_BASE_DIR, appName, date);
    if (!fs.existsSync(filePath)) throw Object.assign(new Error('Log file not found'), { status: 404 });

    const { level, q } = filters;
    res.setHeader('Content-Disposition', `attachment; filename="${appName}-${date}.log"`);
    res.setHeader('Content-Type', 'text/plain');

    if (!level && !q) { fs.createReadStream(filePath).pipe(res); return; }

    const stream = fs.createReadStream(filePath, 'utf8');
    const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', line => {
      if (!line.trim()) return;
      try {
        const p = JSON.parse(line);
        if (level && p.level !== level) return;
        if (q && !line.toLowerCase().includes(q.toLowerCase())) return;
      } catch {
        if (q && !line.toLowerCase().includes(q.toLowerCase())) return;
      }
      res.write(line + '\n');
    });
    rl.on('close', () => res.end());
    rl.on('error', err => { logger.error(`[Download] ${err.message}`); res.end(); });
    stream.on('error', err => { logger.error(`[Download] ${err.message}`); res.end(); });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async _resolveFiles(service, date) {
    const files = [];
    if (service && date) {
      try { sanitizeAppName(service); sanitizeDate(date); } catch { return []; }
      files.push({ appName: service, filePath: safeLogPath(config.LOG_BASE_DIR, service, date) });
    } else if (service) {
      try { sanitizeAppName(service); } catch { return []; }
      const appDir = path.join(config.LOG_BASE_DIR, service);
      let allFiles = [];
      try { allFiles = await fsP.readdir(appDir); } catch {}
      for (const f of allFiles.filter(f => /^\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort().reverse()) {
        files.push({ appName: service, filePath: path.join(appDir, f) });
      }
    } else {
      const services = await this.getServices();
      const targetDate = date || getToday();
      for (const { appName } of services) {
        try {
          sanitizeDate(targetDate);
          files.push({ appName, filePath: safeLogPath(config.LOG_BASE_DIR, appName, targetDate) });
        } catch {}
      }
    }
    return files;
  }
}

module.exports = LogService;
