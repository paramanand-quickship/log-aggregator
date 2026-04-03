'use strict';
const fsP    = require('fs').promises;
const config = require('../config');

// ── Catalogue ──────────────────────────────────────────────────────────────

const ALL_PAGES = [
  { id: 'dashboard',     label: 'Dashboard',       lockFor: ['admin','viewer'] }, // always on
  { id: 'logs',          label: 'Logs' },
  { id: 'live',          label: 'Live Stream' },
  { id: 'analytics',     label: 'Analytics' },
  { id: 'api-analytics', label: 'API Analytics' },
  { id: 'health',        label: 'Health' },
  { id: 'settings',      label: 'Settings',        lockFor: ['admin'] }, // admin always has settings
  { id: 'roles',         label: 'Role Config',     lockFor: ['admin'] }, // admin always has roles
];

const ALL_CARDS = [
  { id: 'stat-logs',      label: 'Logs Today',        section: 'Stats' },
  { id: 'stat-errors',    label: 'Errors Today',      section: 'Stats' },
  { id: 'stat-services',  label: 'Services Count',    section: 'Stats' },
  { id: 'stat-errorrate', label: 'Error Rate',        section: 'Stats' },
  { id: 'chart-hourly',   label: 'Hourly Volume',     section: 'Charts' },
  { id: 'chart-services', label: 'Top Services',      section: 'Charts' },
  { id: 'recent-errors',  label: 'Recent Errors',     section: 'Tables' },
];

const DEFAULTS = {
  viewer: {
    pages: ['dashboard', 'logs', 'live', 'analytics'],
    cards: ['stat-logs', 'stat-errors', 'chart-hourly', 'recent-errors'],
  },
  admin: {
    pages: ['dashboard', 'logs', 'live', 'analytics', 'api-analytics', 'health', 'settings', 'roles'],
    cards: ['stat-logs', 'stat-errors', 'stat-services', 'stat-errorrate', 'chart-hourly', 'chart-services', 'recent-errors'],
  },
};

// ── Service ────────────────────────────────────────────────────────────────

class RoleConfigService {

  // Expose catalogue so controllers/views can use it
  static ALL_PAGES = ALL_PAGES;
  static ALL_CARDS = ALL_CARDS;

  async getConfig () {
    try {
      const raw = await fsP.readFile(config.SETTINGS_FILE.replace('settings.json', 'role-config.json'), 'utf8');
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (err) {
      if (err.code === 'ENOENT') return JSON.parse(JSON.stringify(DEFAULTS));
      throw err;
    }
  }

  get _filePath () {
    return config.SETTINGS_FILE.replace('settings.json', 'role-config.json');
  }

  async getRoleConfig (role) {
    const cfg = await this.getConfig();
    return cfg[role] || cfg['viewer']; // default to viewer perms if unknown role
  }

  async canAccessPage (role, pageId) {
    // Locked pages are always on for the specified roles
    const page = ALL_PAGES.find(p => p.id === pageId);
    if (page?.lockFor?.includes(role)) return true;

    const rc = await this.getRoleConfig(role);
    return Array.isArray(rc.pages) && rc.pages.includes(pageId);
  }

  async getAllowedCards (role) {
    const rc = await this.getRoleConfig(role);
    return Array.isArray(rc.cards) ? rc.cards : ALL_CARDS.map(c => c.id);
  }

  async getAllowedPages (role) {
    const rc = await this.getRoleConfig(role);
    // merge locked pages
    const locked = ALL_PAGES.filter(p => p.lockFor?.includes(role)).map(p => p.id);
    const set    = new Set([...(rc.pages || []), ...locked]);
    return [...set];
  }

  async saveConfig (updates) {
    const current = await this.getConfig();
    const next    = { ...current };

    for (const [role, perms] of Object.entries(updates)) {
      if (!next[role]) next[role] = { pages: [], cards: [] };

      // Enforce locked pages
      if (perms.pages !== undefined) {
        const locked = ALL_PAGES.filter(p => p.lockFor?.includes(role)).map(p => p.id);
        const merged = new Set([...perms.pages, ...locked]);
        next[role].pages = [...merged];
      }

      if (perms.cards !== undefined) {
        next[role].cards = perms.cards;
      }
    }

    await fsP.writeFile(this._filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}

module.exports = { RoleConfigService, ALL_PAGES, ALL_CARDS };
