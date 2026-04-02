'use strict';
const express   = require('express');
const fs        = require('fs');
const fsP       = require('fs').promises;
const path      = require('path');
const readline  = require('readline');
const config    = require('../config');
const authenticate = require('../middleware/auth');
const { safeLogPath, sanitizeAppName, sanitizeDate } = require('../lib/utils');
const logger    = require('../lib/logger');

const router = express.Router();

// ── GET /files/list ───────────────────────────────────────────────────────
router.get('/list', authenticate, async (req, res) => {
  try {
    let appDirs;
    try {
      appDirs = await fsP.readdir(config.LOG_BASE_DIR);
    } catch (err) {
      if (err.code === 'ENOENT') return res.json([]);
      throw err;
    }

    const results = await Promise.all(
      appDirs.map(async (app) => {
        const appPath = path.join(config.LOG_BASE_DIR, app);
        try {
          const stat = await fsP.stat(appPath);
          if (!stat.isDirectory()) return null;
          const files = await fsP.readdir(appPath);
          const dates = files
            .filter(f => f.endsWith('.log'))
            .map(f => f.replace('.log', ''))
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort()
            .reverse();
          return { appName: app, dates };
        } catch {
          return null;
        }
      })
    );

    res.json(results.filter(Boolean));
  } catch (err) {
    logger.error(`[Files] list error: ${err.message}`);
    res.status(500).json({ error: 'Could not read log directory' });
  }
});

// ── GET /files/tail/:appName/:date ────────────────────────────────────────
router.get('/tail/:appName/:date', authenticate, (req, res) => {
  let appName, date;
  try {
    appName = sanitizeAppName(req.params.appName);
    date    = sanitizeDate(req.params.date);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const rawLines = parseInt(req.query.lines, 10);
  const lines    = isNaN(rawLines) || rawLines < 1 ? 100 : Math.min(rawLines, 10_000);
  const follow   = req.query.follow === 'true';

  let filePath;
  try {
    filePath = safeLogPath(config.LOG_BASE_DIR, appName, date);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Log file not found' });
  }

  if (!follow) {
    // Tail (last N lines) without follow
    const stream = fs.createReadStream(filePath, 'utf8');
    const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const buffer = [];
    rl.on('line', line => {
      buffer.push(line);
      if (buffer.length > lines) buffer.shift();
    });
    rl.on('close', () => res.json({ appName, date, lines: buffer }));
    rl.on('error', err => res.status(500).json({ error: err.message }));
    stream.on('error', err => res.status(500).json({ error: err.message }));
  } else {
    // Follow (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let lastSize = 0;
    let watcher;

    function sendChunk(start) {
      const readStream = fs.createReadStream(filePath, { start, encoding: 'utf8' });
      readStream.on('data', chunk => {
        chunk.split('\n').forEach(line => {
          if (line) res.write(`data: ${line}\n\n`);
        });
      });
      readStream.on('error', err => res.write(`event: error\ndata: ${err.message}\n\n`));
    }

    // Send last N lines first, then watch for new data
    const initStream = fs.createReadStream(filePath, 'utf8');
    const rl = readline.createInterface({ input: initStream, crlfDelay: Infinity });
    const initBuf = [];
    rl.on('line', l => { initBuf.push(l); if (initBuf.length > lines) initBuf.shift(); });
    rl.on('close', () => {
      initBuf.forEach(l => res.write(`data: ${l}\n\n`));
      lastSize = fs.statSync(filePath).size;

      watcher = fs.watch(filePath, () => {
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (stats.size > lastSize) {
            sendChunk(lastSize);
            lastSize = stats.size;
          }
        });
      });
    });

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 30_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      if (watcher) watcher.close();
      res.end();
    });
  }
});

// ── GET /files/search/:appName/:date ──────────────────────────────────────
router.get('/search/:appName/:date', authenticate, (req, res) => {
  let appName, date;
  try {
    appName = sanitizeAppName(req.params.appName);
    date    = sanitizeDate(req.params.date);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { q, case: caseSensitive, limit: rawLimit, offset: rawOffset } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter "q"' });

  const limit  = Math.min(parseInt(rawLimit,  10) || 500, 10_000);
  const offset = Math.max(parseInt(rawOffset, 10) || 0,   0);

  let filePath;
  try {
    filePath = safeLogPath(config.LOG_BASE_DIR, appName, date);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Log file not found' });
  }

  let regex;
  try {
    regex = new RegExp(q, caseSensitive === 'true' ? 'g' : 'gi');
  } catch {
    return res.status(400).json({ error: 'Invalid regular expression' });
  }

  const stream  = fs.createReadStream(filePath, 'utf8');
  const rl      = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const matches = [];
  let lineNum   = 0;
  let skipped   = 0;

  rl.on('line', line => {
    lineNum++;
    regex.lastIndex = 0; // reset stateful regex
    if (regex.test(line)) {
      if (skipped < offset) { skipped++; return; }
      if (matches.length < limit) matches.push({ lineNum, line });
    }
  });
  rl.on('close', () => res.json({ appName, date, query: q, total: matches.length, offset, limit, matches }));
  rl.on('error', err => res.status(500).json({ error: err.message }));
  stream.on('error', err => res.status(500).json({ error: err.message }));
});

// ── GET /files/download/:appName/:date ────────────────────────────────────
router.get('/download/:appName/:date', authenticate, (req, res) => {
  let appName, date;
  try {
    appName = sanitizeAppName(req.params.appName);
    date    = sanitizeDate(req.params.date);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let filePath;
  try {
    filePath = safeLogPath(config.LOG_BASE_DIR, appName, date);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Log file not found' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${appName}-${date}.log"`);
  res.setHeader('Content-Type', 'text/plain');
  fs.createReadStream(filePath).pipe(res);
});



module.exports = router;
