'use strict';
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const cur = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log (level, message) {
	if (LEVELS[level] > cur) {
		return;
	}
	const line = JSON.stringify({ ts: new Date().toISOString(), level, message });
	(level === 'error' || level === 'warn'
		? process.stderr
		: process.stdout
	).write(`${line}\n`);
}

module.exports = {
	error: (m) => log('error', m),
	warn: (m) => log('warn', m),
	info: (m) => log('info', m),
	debug: (m) => log('debug', m),
};
