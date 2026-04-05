/* eslint-disable no-console */
'use strict';
/**
 * Blorq Client Logger
 * Drop-in structured logger that ships to Blorq.
 *
 * Usage:
 *   const logger = require('./client/logger');
 *   logger.configure({ appName:'my-api', remoteUrl:'http://blorq:9900/api/logs', apiKey:'blq_...' });
 *   app.use(logger.requestLogger());          // request metrics
 *   const log = logger.create({ service:'PaymentSvc' });
 *   log.info('done', { amount:99 });
 */
const os     = require('os');
const crypto = require('crypto');

let CFG = {
  appName:          process.env.APP_NAME        || 'app',
  remoteUrl:        process.env.LOG_REMOTE_URL  || 'http://localhost:9900/api/logs',
  apiKey:           process.env.LOG_API_KEY     || '',
  level:            process.env.LOG_LEVEL       || 'info',
  prettyPrint:      process.env.NODE_ENV !== 'production',
  bufferSize:       Number(process.env.LOG_BUFFER_SIZE)    || 50,
  flushInterval:    Number(process.env.LOG_FLUSH_INTERVAL) || 100,
  remoteTimeout:    Number(process.env.LOG_REMOTE_TIMEOUT) || 200,
  remoteRetries:    Number(process.env.LOG_REMOTE_RETRIES) || 2,
  interceptConsole: process.env.LOG_INTERCEPT === 'true',
  skipPaths:        (process.env.LOG_SKIP_PATHS || '/health,/ping,/favicon').split(',').map(s=>s.trim()),
};

const LEVELS = { debug:10, info:20, warn:30, error:40, fatal:50 };
const MASK   = ['authorization','token','password','secret','apikey','key','auth'];
const state  = { buf:[], fp:null, installed:false, orig:null };

function shouldLog(l){ return (LEVELS[l]||0)>=(LEVELS[CFG.level]||20); }
function safeStr(o){ const s=new WeakSet(); return JSON.stringify(o,(k,v)=>{ if(typeof v==='object'&&v!==null){if(s.has(v))return'[Circular]';s.add(v);} if(k&&MASK.some(m=>k.toLowerCase().includes(m)))return'***'; return v; }); }
function fmt(level,appName,ctx,msg,extras){
  const p={ts:new Date().toISOString(),level:level.toUpperCase(),appName:appName||CFG.appName,host:os.hostname(),pid:process.pid,...ctx,message:String(msg)};
  if(extras&&extras.length) p.data=extras.map(x=>x instanceof Error?{errorMessage:x.message,stack:x.stack}:x);
  return CFG.prettyPrint?JSON.stringify(p,null,2):safeStr(p);
}
function enq(line){ state.buf.push(line); if(state.buf.length>=CFG.bufferSize)flush(); }
function flush(){ if(state.fp){state.fp=state.fp.then(()=>drain());return;} state.fp=drain().finally(()=>{state.fp=null;}); }
async function drain(){ return new Promise(r=>setImmediate(async()=>{ const logs=state.buf.splice(0); if(!logs.length){r();return;} if(CFG.prettyPrint) for(const l of logs){try{process.stdout.write(l+'\n');}catch{}} if(CFG.remoteUrl) send(logs).catch(()=>{}); r(); })); }
async function send(logs){ let a=0,max=CFG.remoteRetries+1; while(a<max){ try{ const r=await fetch(CFG.remoteUrl,{method:'POST',headers:{'Content-Type':'application/json',...(CFG.apiKey?{'x-api-key':CFG.apiKey}:{})},body:JSON.stringify({appName:CFG.appName,logs}),signal:AbortSignal.timeout(CFG.remoteTimeout)}); if(r.ok)return; throw new Error('HTTP '+r.status); }catch{ a++; if(a>=max)return; await new Promise(r=>setTimeout(r,200*Math.pow(2,a-1))); } } }

class Logger {
  constructor(ctx={}){ this.ctx=ctx; this.appName=ctx.appName||CFG.appName; }
  child(e={}){ return new Logger({...this.ctx,...e}); }
  _l(l,m,p){ if(!shouldLog(l))return; enq(fmt(l,this.appName,this.ctx,m,p)); }
  debug(m,...p){ this._l('debug',m,p); }
  info (m,...p){ this._l('info', m,p); }
  warn (m,...p){ this._l('warn', m,p); }
  error(m,...p){ this._l('error',m,p); }
  fatal(m,...p){ if(!shouldLog('fatal'))return; const f=fmt('fatal',this.appName,this.ctx,m,p); try{process.stderr.write(f+'\n');}catch{} if(CFG.remoteUrl)send([f]).catch(()=>{}); }
}

const root = new Logger();

root.configure = function(opts={}){ Object.assign(CFG,opts); if(opts.interceptConsole)root.install(); };
root.create    = function(ctx={}){ return new Logger(ctx); };

root.install = function(){ if(state.installed)return; state.installed=true; state.orig={log:console.log.bind(console),warn:console.warn.bind(console),error:console.error.bind(console),debug:console.debug.bind(console),info:console.info.bind(console)}; const mk=(l,o)=>function(...a){o(...a);const m=a.map(x=>typeof x==='string'?x:safeStr(x)).join(' ');if(shouldLog(l))enq(fmt(l,CFG.appName,{},m,[]));}; console.log=mk('info',state.orig.log); console.info=mk('info',state.orig.info); console.warn=mk('warn',state.orig.warn); console.error=mk('error',state.orig.error); console.debug=mk('debug',state.orig.debug); };
root.uninstall = function(){ if(!state.installed||!state.orig)return; Object.assign(console,state.orig); state.installed=false; };
root.console   = { log:(...a)=>root.info(...a), info:(...a)=>root.info(...a), warn:(...a)=>root.warn(...a), error:(...a)=>root.error(...a), debug:(...a)=>root.debug(...a) };

root.requestLogger = function(){ return function(req,res,next){ const raw=req.path||req.url?.split('?')[0]||'/'; if(CFG.skipPaths.some(p=>raw.startsWith(p)))return next(); const t=process.hrtime.bigint(),rid=req.headers['x-request-id']||crypto.randomUUID(),rsz=parseInt(req.headers['content-length']||'0',10)||0; req.requestId=rid; res.setHeader('X-Request-Id',rid); let done=false; const rec=()=>{ if(done)return; done=true; const ms=Math.round(Number(process.hrtime.bigint()-t)/1e4)/100,sc=res.statusCode,p=(req.baseUrl||'')+(req.route?req.route.path:raw); enq(JSON.stringify({ts:new Date().toISOString(),level:sc>=500?'error':sc>=400?'warn':'info',appName:CFG.appName+'-requests',type:'api_request',requestId:rid,method:req.method,path:p,statusCode:sc,durationMs:ms,reqSizeBytes:rsz,resSizeBytes:parseInt(res.getHeader('content-length')||'0',10)||0,message:req.method+' '+p+' '+sc+' '+ms+'ms'})); }; res.once('finish',rec); res.once('close',rec); next(); }; };

setInterval(()=>flush(),CFG.flushInterval).unref();
process.on('beforeExit',()=>flush());
process.on('SIGINT',()=>{flush();process.exit(0);});
process.on('SIGTERM',()=>{flush();process.exit(0);});
if(CFG.interceptConsole)root.install();
module.exports=root;
