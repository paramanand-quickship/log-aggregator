'use strict';
const fs     = require('fs').promises;
const config = require('../config');
const logger = require('../lib/logger');

const DEFAULTS = {
  retentionDays: 7,
  webhookUrl:    '',
  enableStream:  true,
};

class SettingsService {

  // ── Read ──────────────────────────────────────────────────────────────────

  async get() {
    let stored = {};
    try {
      stored = JSON.parse(await fs.readFile(config.SETTINGS_FILE, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    return { ...DEFAULTS, ...stored };
  }

  // ── Save (validates + writes + patches live config) ───────────────────────

  async save(updates) {
    const current = await this.get();
    const next    = { ...current };

    if (updates.retentionDays !== undefined) {
      const v = parseInt(updates.retentionDays, 10);
      if (isNaN(v) || v < 1 || v > 365)
        throw Object.assign(new Error('retentionDays must be 1–365'), { status: 400 });
      next.retentionDays = v;
    }

    if (updates.webhookUrl !== undefined) {
      const url = String(updates.webhookUrl).trim();
      if (url && !/^https?:\/\/.+/.test(url))
        throw Object.assign(new Error('webhookUrl must be a valid http(s) URL or empty'), { status: 400 });
      next.webhookUrl = url;
    }

    if (updates.enableStream !== undefined) {
      next.enableStream = Boolean(updates.enableStream);
    }

    await fs.writeFile(config.SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
    logger.info('[Settings] Saved: ' + JSON.stringify(updates));

    // Patch live config so changes take effect without restart
    if (next.retentionDays !== undefined) config.RETENTION_DAYS = next.retentionDays;
    if (next.webhookUrl    !== undefined) config.WEBHOOK_URL    = next.webhookUrl;
    if (next.enableStream  !== undefined) config.ENABLE_STREAM  = next.enableStream;

    return next;
  }

  // ── Reset to defaults ─────────────────────────────────────────────────────

  async reset() {
    await fs.writeFile(config.SETTINGS_FILE, JSON.stringify(DEFAULTS, null, 2), 'utf8');
    config.RETENTION_DAYS = DEFAULTS.retentionDays;
    config.WEBHOOK_URL    = DEFAULTS.webhookUrl;
    config.ENABLE_STREAM  = DEFAULTS.enableStream;
    logger.info('[Settings] Reset to defaults');
    return DEFAULTS;
  }
}

module.exports = SettingsService;
