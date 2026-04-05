'use strict';
const fsP    = require('fs').promises;
const config = require('../config');
const logger = require('../lib/logger');
let _cache=null, _cacheTime=0;
const TTL=30000;

async function getList() {
  if (_cache && Date.now()-_cacheTime<TTL) return _cache;
  try {
    const s=JSON.parse(await fsP.readFile(config.SETTINGS_FILE,'utf8'));
    _cache=Array.isArray(s.ipWhitelist)?s.ipWhitelist.map(x=>x.trim()).filter(Boolean):[];
    _cacheTime=Date.now();
  } catch { _cache=[]; }
  return _cache;
}

function bustCache() { _cache=null; }

function ipWhitelist() {
  return async function(req, res, next) {
    const list = await getList();
    if (!list.length) return next();
    const raw  = (req.headers['x-forwarded-for']||req.ip||'').split(',')[0].trim().replace('::ffff:','');
    const ok   = list.some(e => e.endsWith('/24') ? raw.startsWith(e.slice(0,e.lastIndexOf('.'))+'.') : raw===e);
    if (!ok) { logger.warn('[IPWhitelist] Blocked '+raw+' '+req.method+' '+req.path); return res.status(403).json({error:'IP not whitelisted'}); }
    next();
  };
}
module.exports = { ipWhitelist, bustCache };
