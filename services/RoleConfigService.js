'use strict';
const fsP    = require('fs').promises;
const config = require('../config');

const ALL_PAGES = [
  { id: 'dashboard',     label: 'Dashboard',       alwaysOn: true },
  { id: 'logs',          label: 'Logs' },
  { id: 'live',          label: 'Live Stream' },
  { id: 'insights',      label: 'Insights' },
  { id: 'health',        label: 'Health' },
  { id: 'users',         label: 'User Management',  adminOnly: true },
  { id: 'api-keys',      label: 'API Keys',          adminOnly: true },
  { id: 'settings',      label: 'Settings',          adminOnly: true },
  { id: 'roles',         label: 'Role Config',       adminOnly: true },
];

const ALL_CARDS = [
  { id: 'stat-logs',         label: 'Logs Today',          section: 'Dashboard Stats' },
  { id: 'stat-errors',       label: 'Errors Today',        section: 'Dashboard Stats' },
  { id: 'stat-services',     label: 'Services Count',      section: 'Dashboard Stats' },
  { id: 'stat-errorrate',    label: 'Error Rate',          section: 'Dashboard Stats' },
  { id: 'chart-hourly',      label: 'Hourly Volume',       section: 'Dashboard Charts' },
  { id: 'chart-services',    label: 'Top Services',        section: 'Dashboard Charts' },
  { id: 'recent-errors',     label: 'Recent Errors',       section: 'Dashboard Tables' },
  { id: 'ins-stats',         label: 'Log Level Stats',     section: 'Insights - Logs' },
  { id: 'ins-hourly',        label: 'Log Hourly Chart',    section: 'Insights - Logs' },
  { id: 'ins-donut',         label: 'Level Distribution',  section: 'Insights - Logs' },
  { id: 'ins-trend',         label: '7-Day Trend',         section: 'Insights - Logs' },
  { id: 'ins-services',      label: 'Top Services Table',  section: 'Insights - Logs' },
  { id: 'api-stats',         label: 'API Stat Cards',      section: 'Insights - API' },
  { id: 'api-hourly',        label: 'API Hourly Chart',    section: 'Insights - API' },
  { id: 'api-status',        label: 'Status Distribution', section: 'Insights - API' },
  { id: 'api-slowest',       label: 'Slowest Endpoints',   section: 'Insights - API' },
  { id: 'api-endpoints',     label: 'Endpoints Table',     section: 'Insights - API' },
  { id: 'api-errors',        label: 'Error Hot-spots',     section: 'Insights - API' },
  { id: 'api-trend',         label: 'Trend Analysis',      section: 'Insights - API' },
];

const BUILT_IN = {
  admin: {
    label: 'Administrator', color: '#6366f1', isBuiltIn: true,
    pages: ALL_PAGES.map(p=>p.id),
    cards: ALL_CARDS.map(c=>c.id),
  },
  viewer: {
    label: 'Viewer', color: '#22c55e', isBuiltIn: true,
    pages: ['dashboard','logs','live','insights'],
    cards: ['stat-logs','stat-errors','chart-hourly','recent-errors','ins-stats','ins-hourly','ins-donut','ins-trend'],
  },
};

class RoleConfigService {
  static ALL_PAGES = ALL_PAGES;
  static ALL_CARDS = ALL_CARDS;

  async getRoles() {
    try {
      const file = JSON.parse(await fsP.readFile(config.ROLES_FILE,'utf8'));
      // Merge built-ins with file (file can override built-in pages/cards)
      const merged = { ...BUILT_IN };
      for (const [name,def] of Object.entries(file)) {
        merged[name] = { ...BUILT_IN[name], ...def };
      }
      return merged;
    } catch(e) { if(e.code==='ENOENT') return {...BUILT_IN}; throw e; }
  }

  async getRoleConfig(role) {
    const roles = await this.getRoles();
    return roles[role] || roles.viewer;
  }

  async canAccessPage(role, pageId) {
    if (pageId === 'dashboard') return true;
    const cfg = await this.getRoleConfig(role);
    return Array.isArray(cfg.pages) && cfg.pages.includes(pageId);
  }

  async getAllowedPages(role) {
    const cfg = await this.getRoleConfig(role);
    const s = new Set(Array.isArray(cfg.pages)?cfg.pages:[]);
    s.add('dashboard');
    return [...s];
  }

  async getAllowedCards(role) {
    const cfg = await this.getRoleConfig(role);
    return Array.isArray(cfg.cards) ? cfg.cards : [];
  }

  async saveRoles(roles) {
    await fsP.writeFile(config.ROLES_FILE, JSON.stringify(roles,null,2),'utf8');
    return roles;
  }

  async upsertRole(name, def) {
    if (!name || !/^[a-zA-Z0-9_-]{2,32}$/.test(name))
      throw Object.assign(new Error('Role name 2-32 chars alphanumeric/_-'), {status:400});
    const roles = await this.getRoles();
    roles[name] = {
      label:     def.label || name,
      color:     def.color || '#6b7280',
      isBuiltIn: false,
      pages:     Array.isArray(def.pages) ? def.pages : [],
      cards:     Array.isArray(def.cards) ? def.cards : [],
    };
    await this.saveRoles(roles);
    return roles[name];
  }

  async deleteRole(name) {
    if (name==='admin'||name==='viewer')
      throw Object.assign(new Error('Cannot delete built-in roles'),{status:400});
    const roles = await this.getRoles();
    if (!roles[name]) throw Object.assign(new Error('Role not found'),{status:404});
    delete roles[name];
    await this.saveRoles(roles);
  }
}

module.exports = { RoleConfigService, ALL_PAGES, ALL_CARDS };
