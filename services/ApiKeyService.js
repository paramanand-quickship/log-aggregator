'use strict';
const crypto = require('crypto');
const fsP    = require('fs').promises;
const config = require('../config');
const logger = require('../lib/logger');

const VALID_SCOPES = ['logs:write','logs:read','analytics:read','health:read','stream:read'];

class ApiKeyService {
  _hash(raw) { return crypto.createHash('sha256').update(raw).digest('hex'); }

  async _load() {
    try { return JSON.parse(await fsP.readFile(config.API_KEYS_FILE,'utf8')); }
    catch(e) { if(e.code==='ENOENT') return []; throw e; }
  }
  async _save(keys) { await fsP.writeFile(config.API_KEYS_FILE,JSON.stringify(keys,null,2),'utf8'); }

  async list() {
    const keys = await this._load();
    return keys.map(k => ({...k, keyHash:undefined, key:undefined}));
  }

  async validate(rawKey) {
    if (!rawKey) return null;
    const keys = await this._load();
    const hash = this._hash(rawKey);
    const found = keys.find(k => k.active && k.keyHash===hash);
    if (!found) return null;
    if (found.expiresAt && new Date(found.expiresAt) < new Date()) return null;
    found.lastUsedAt = new Date().toISOString();
    this._save(keys).catch(()=>{});
    return found;
  }

  async create({name, scopes=['logs:write'], expiresAt=null, createdBy='system'}) {
    if (!name||name.length<2||name.length>64)
      throw Object.assign(new Error('Name must be 2-64 chars'),{status:400});
    const bad = (scopes||[]).filter(s=>!VALID_SCOPES.includes(s));
    if (bad.length) throw Object.assign(new Error('Invalid scopes: '+bad.join(',')),{status:400});
    const keys = await this._load();
    if (keys.find(k=>k.name===name)) throw Object.assign(new Error('Key name already exists'),{status:409});

    const raw = 'blq_'+crypto.randomBytes(32).toString('hex');
    const entry = {
      id:         crypto.randomUUID(),
      name, keyHash:this._hash(raw),
      keyPrefix:  raw.slice(0,14)+'…',
      scopes:     scopes||['logs:write'],
      active:     true,
      expiresAt:  expiresAt||null,
      createdAt:  new Date().toISOString(),
      createdBy,
      lastUsedAt: null,
    };
    keys.push(entry);
    await this._save(keys);
    logger.info('[ApiKey] Created "'+name+'" scopes='+scopes.join(','));
    return {...entry, key:raw, keyHash:undefined};
  }

  async revoke(id, actor) {
    const keys=await this._load(), idx=keys.findIndex(k=>k.id===id);
    if (idx===-1) throw Object.assign(new Error('Key not found'),{status:404});
    keys[idx].active=false;
    await this._save(keys);
    logger.info('[ApiKey] Revoked "'+keys[idx].name+'" by '+actor);
  }

  async remove(id, actor) {
    const keys=await this._load(), k=keys.find(k=>k.id===id);
    if (!k) throw Object.assign(new Error('Key not found'),{status:404});
    await this._save(keys.filter(x=>x.id!==id));
    logger.info('[ApiKey] Deleted "'+k.name+'" by '+actor);
  }

  async update(id, updates, actor) {
    const keys=await this._load(), k=keys.find(x=>x.id===id);
    if (!k) throw Object.assign(new Error('Key not found'),{status:404});
    if (updates.scopes) { const bad=updates.scopes.filter(s=>!VALID_SCOPES.includes(s)); if(bad.length) throw Object.assign(new Error('Invalid scopes'),{status:400}); k.scopes=updates.scopes; }
    if (updates.expiresAt!==undefined) k.expiresAt=updates.expiresAt||null;
    if (updates.active!==undefined)    k.active=Boolean(updates.active);
    if (updates.name)                  k.name=updates.name;
    await this._save(keys);
    logger.info('[ApiKey] Updated "'+k.name+'" by '+actor);
    return {...k, keyHash:undefined};
  }
}
module.exports = ApiKeyService;
