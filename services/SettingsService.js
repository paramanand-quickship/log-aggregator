'use strict';
const fs     = require('fs').promises;
const config = require('../config');
const logger = require('../lib/logger');

const DEFAULTS = { retentionDays:7, webhookUrl:'', enableStream:true, ipWhitelist:[] };

class SettingsService {
  async get() {
    let s={};
    try { s=JSON.parse(await fs.readFile(config.SETTINGS_FILE,'utf8')); }
    catch(e){ if(e.code!=='ENOENT') throw e; }
    return {...DEFAULTS,...s};
  }

  async save(updates) {
    const current=await this.get(), next={...current};
    if (updates.retentionDays!==undefined) {
      const v=parseInt(updates.retentionDays,10);
      if(isNaN(v)||v<1||v>365) throw Object.assign(new Error('retentionDays must be 1-365'),{status:400});
      next.retentionDays=v;
    }
    if (updates.webhookUrl!==undefined) {
      const u=String(updates.webhookUrl).trim();
      if(u&&!/^https?:\/\/.+/.test(u)) throw Object.assign(new Error('Invalid webhook URL'),{status:400});
      next.webhookUrl=u;
    }
    if (updates.enableStream!==undefined) next.enableStream=Boolean(updates.enableStream);
    if (updates.ipWhitelist!==undefined) {
      if(!Array.isArray(updates.ipWhitelist)) throw Object.assign(new Error('ipWhitelist must be array'),{status:400});
      next.ipWhitelist=updates.ipWhitelist.filter(s=>typeof s==='string');
    }
    await fs.writeFile(config.SETTINGS_FILE,JSON.stringify(next,null,2),'utf8');
    logger.info('[Settings] Saved: '+JSON.stringify(updates));
    if(next.retentionDays!==undefined) config.RETENTION_DAYS=next.retentionDays;
    if(next.webhookUrl!==undefined)    config.WEBHOOK_URL=next.webhookUrl;
    if(next.enableStream!==undefined)  config.ENABLE_STREAM=next.enableStream;
    try { require('../middleware/ipWhitelist').bustCache(); } catch {}
    return next;
  }

  async reset() {
    await fs.writeFile(config.SETTINGS_FILE,JSON.stringify(DEFAULTS,null,2),'utf8');
    return DEFAULTS;
  }
}
module.exports = SettingsService;
