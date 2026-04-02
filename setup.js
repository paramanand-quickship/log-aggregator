#!/usr/bin/env node
'use strict';
/**
 * First-run setup: creates users.json with hashed passwords.
 * Run once: node setup.js
 */
const bcrypt = require('bcryptjs');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const USERS_FILE    = path.join(__dirname, 'users.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const ENV_FILE      = path.join(__dirname, '.env');

async function main() {
  console.log('\n🚀  Log Aggregator — First-Run Setup\n');

  // users.json
  if (fs.existsSync(USERS_FILE)) {
    console.log('⚠️   users.json already exists — skipping user creation.');
  } else {
    const adminHash  = await bcrypt.hash('admin123',  10);
    const viewerHash = await bcrypt.hash('viewer123', 10);
    const users = {
      admin:  { password: adminHash,  role: 'admin'  },
      viewer: { password: viewerHash, role: 'viewer' },
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log('✅  users.json created');
    console.log('    admin  / admin123  (role: admin)');
    console.log('    viewer / viewer123 (role: viewer)');
    console.log('    ⚠️  Change these passwords before deploying to production!\n');
  }

  // settings.json
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ retentionDays: 7 }, null, 2));
    console.log('✅  settings.json created');
  }

  // .env (if missing)
  if (!fs.existsSync(ENV_FILE)) {
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    const apiKey    = crypto.randomBytes(24).toString('hex');
    const envContent = [
      `NODE_ENV=development`,
      `PORT=9900`,
      `JWT_SECRET=${jwtSecret}`,
      `API_KEY=${apiKey}`,
      `LOG_BASE_DIR=./logs`,
      `RETENTION_DAYS=7`,
      `ENABLE_STREAM=true`,
      `WEBHOOK_URL=`,
    ].join('\n') + '\n';
    fs.writeFileSync(ENV_FILE, envContent);
    console.log('✅  .env created with generated secrets');
    console.log(`    API_KEY=${apiKey}\n`);
  } else {
    console.log('⚠️   .env already exists — skipping.');
  }

  console.log('\n🎉  Setup complete! Start the server:\n');
  console.log('    npm start\n');
  console.log('    Then open: http://localhost:9900\n');
}

main().catch(err => { console.error('Setup error:', err.message); process.exit(1); });
