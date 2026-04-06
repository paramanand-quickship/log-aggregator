<div align="center">
  <img src="views/logo.png" alt="Blorq" height="64"/>
  <h1>Blorq</h1>
  <p><strong>Production-grade, open-source log aggregator.<br/>One command to install. Runs as a system service on macOS, Linux & Windows.</strong></p>
</div>

---

## Install

### macOS / Linux (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/your-org/blorq/main/install.sh | bash
```

Then start it:
```bash
blorq start
# → http://localhost:9900   admin / admin123
```

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/your-org/blorq/main/install.ps1 | iex
```

### npm (global)

```bash
npm install -g blorq
blorq setup   # create data/, .env, default users
blorq start
```

### npx (no install needed)

```bash
npx blorq start   # downloads and runs immediately
```

### Docker

```bash
docker run -d \
  -p 9900:9900 \
  -v $PWD/data:/data \
  -v $PWD/logs:/logs \
  -e JWT_SECRET=your-32-char-secret \
  --name blorq \
  --restart unless-stopped \
  ghcr.io/your-org/blorq:latest
```

```bash
# Or with docker-compose:
docker compose up -d
```

---

## CLI reference

```
blorq start                   Start in foreground
blorq start --background      Start in background (daemon)
blorq start --port 8080       Custom port
blorq stop                    Stop background instance
blorq restart                 Restart background instance
blorq status                  Show running status + PID
blorq setup                   First-run: create data/, .env, users
blorq open                    Open dashboard in browser

blorq service install         Register as OS service (starts on boot)
blorq service uninstall       Remove OS service
blorq service start           Start OS service
blorq service stop            Stop OS service
blorq service restart         Restart OS service
blorq service logs            Tail service logs

blorq --version
blorq --help
```

### Auto-start on boot

```bash
blorq service install
# macOS  → launchd plist in ~/Library/LaunchAgents/
# Linux  → systemd user unit  (~/.config/systemd/user/blorq.service)
# Windows→ Windows Service via sc.exe (run as Administrator)
```

---

## Quick start after install

```
URL:      http://localhost:9900
Login:    admin / admin123
```

1. Open the dashboard → you'll see an empty state
2. Go to **API Keys** → create a key with `logs:write` scope
3. Send your first log:

```bash
curl -X POST http://localhost:9900/api/logs \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: blq_your_key" \
  -d '{"appName":"test","logs":["{\"level\":\"info\",\"message\":\"Hello Blorq!\",\"ts\":\"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'\"}"]}' 
```

4. Refresh the dashboard — your service appears.

---

## Add to your Node.js app

```bash
npm install blorq-logger
```

```js
const logger = require('blorq-logger');

logger.configure({
  appName:  'my-api',
  remoteUrl:'http://localhost:9900/api/logs',
  apiKey:   'blq_your_key',
});

// Express: one line for request metrics
app.use(logger.express());

// Structured logging
logger.info('Server started', { port: 3000 });
logger.error('DB timeout', new Error('Connection refused'));

// Or intercept existing console.log calls
logger.install();  // all console.* now ship to Blorq
```

See [blorq-logger](./client/logger.js) for Next.js, Fastify, NestJS, plain Node adapters.

---

## Configuration

All config via environment variables or `.env` file (auto-loaded):

```env
# .env  (in your Blorq install directory)
PORT=9900
DATA_DIR=./data          # users, keys, roles, settings
LOG_BASE_DIR=./logs      # ingested log files
JWT_SECRET=your-32-char-secret
RETENTION_DAYS=7
NODE_ENV=production
```

See [.env.example](.env.example) for all options.

---

## Features

| Feature | Details |
|---|---|
| **RBAC** | Built-in admin/viewer + unlimited custom roles |
| **API Key Management** | Multi-key, SHA-256 hashed, scopes, expiry, revoke |
| **IP Whitelist** | Restrict ingest endpoint to specific IPs / /24 ranges |
| **2FA (TOTP)** | Per-user optional TOTP via Google Authenticator |
| **Log Analytics** | Hourly charts, level breakdown, 7-day trend, top services |
| **API Analytics** | Per-endpoint latency, error rates, trend analysis |
| **Real-time Stream** | SSE live log feed |
| **Drag & Drop Dashboard** | Rearrange widgets, role-based card visibility |
| **User Management** | Create/delete/reset passwords/revoke 2FA in UI |
| **Role Config** | Visual per-role page + card permissions |

---

## File layout

```
~/.blorq/           # runtime files (macOS/Linux default)
  blorq.pid         # PID of background process
  blorq.log         # stdout from background process
  stdout.log        # service stdout (when using blorq service)
  stderr.log        # service stderr

[install dir]/
  bin/blorq         # CLI binary
  data/             # users.json, api-keys.json, settings.json, role-config.json
  logs/             # ingested log files (one dir per service, one file per day)
  server.js         # HTTP server entry point
  config/index.js   # all configuration
  ...
```

---

## Security checklist for production

```
✅ Set JWT_SECRET to ≥32 random chars
✅ NODE_ENV=production
✅ Change default admin/viewer passwords
✅ Create per-service API keys with minimal scopes
✅ Put Blorq behind a reverse proxy (nginx/caddy) with TLS
✅ Mount data/ and logs/ as persistent volumes (Docker)
```

---

## License

MIT — free to use, modify, and distribute.
