'use strict';
const fs     = require('fs').promises;
const config = require('../config');

async function getUsers() {
  try { return JSON.parse(await fs.readFile(config.USERS_FILE, 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return {}; throw err; }
}

async function saveUsers(users) {
  await fs.writeFile(config.USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

module.exports = { getUsers, saveUsers };
