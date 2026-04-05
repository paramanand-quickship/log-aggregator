'use strict';
const emitter = require('../lib/emitter');
const config  = require('../config');

class StreamController {
  stream(req, res) {
    if (!config.ENABLE_STREAM) return res.status(404).json({ error: 'Stream disabled' });

    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Initial connect event
    res.write('event: connected\n');
    res.write('data: {"status":"connected"}\n\n');

    const levelFilter = req.query.level || null; // optional ?level=error

    const sendLog = (raw) => {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (levelFilter && parsed.level !== levelFilter) return;
        res.write(`data: ${JSON.stringify(parsed)}\n\n`);
      } catch {
        res.write(`data: ${String(raw).replace(/\n/g, ' ')}\n\n`);
      }
    };

    emitter.on('log', sendLog);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

    req.on('close', () => {
      emitter.off('log', sendLog);
      clearInterval(heartbeat);
      res.end();
    });
  }
}

module.exports = StreamController;
