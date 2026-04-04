# Log Aggregator v3

Production-grade log aggregator — MVC architecture, SSE real-time stream, file-based storage, role-based access, dark/light UI.

## Quick Start

```bash
npm install
node setup.js       # creates users.json, .env, settings.json
npm start
# open http://localhost:9900
```

**Default credentials** (change after first login):
| Username | Password  | Role   |
|----------|-----------|--------|
| admin    | admin123  | admin  |
| viewer   | viewer123 | viewer |

## Architecture

```
├── server.js              # App bootstrap, view engine, route mounting
├── config.js              # All environment config
├── setup.js               # First-run setup (users, .env, settings)
│
├── routes/                # Wire-up only — no logic
│   ├── auth.js            # POST /api/auth/login|logout|...
│   ├── logs.js            # POST /api/logs  GET /api/logs/...
│   ├── stream.js          # GET  /api/logs/stream  (SSE)
│   ├── analytics.js       # GET  /api/analytics/...
│   ├── health.js          # GET  /api/health  /api/health/metrics
│   └── ui.js              # GET  / /dashboard /logs /live /analytics
│
├── controllers/           # req/res only — delegate to services
│   ├── AuthController.js
│   ├── LogController.js
│   ├── StreamController.js
│   ├── AnalyticsController.js
│   ├── HealthController.js
│   └── UiController.js
│
├── services/              # All business logic
│   ├── LogService.js      # ingest, tail, search, replay, download
│   ├── AnalyticsService.js# real file-based analytics (no mock data)
│   └── AuthService.js     # JWT, bcrypt, TOTP/2FA
│
├── middleware/
│   ├── auth.js            # JWT cookie auth + UI redirect
│   ├── apiKey.js          # X-Api-Key header check
│   ├── rateLimit.js       # Sliding window rate limiter
│   └── roles.js           # requireRole('admin'|'viewer')
│
├── lib/
│   ├── ejs.js             # Custom EJS-compatible template renderer
│   ├── batchWriter.js     # Buffered file writer (batch + timeout)
│   ├── cleanup.js         # Log retention scheduler
│   ├── emitter.js         # EventEmitter for SSE
│   ├── logger.js          # Structured JSON logger
│   ├── streams.js         # WriteStream pool
│   ├── userStore.js       # users.json read/write
│   └── utils.js           # sanitizeAppName, safeLogPath, formatBytes
│
└── views/                 # EJS templates
    ├── partials/
    │   ├── head.ejs       # Full CSS design system (dark/light)
    │   └── sidebar.ejs    # Navigation sidebar
    ├── login.ejs
    ├── dashboard.ejs      # Stats, hourly chart, recent errors
    ├── logs.ejs           # Search, filter, tail, download
    ├── live.ejs           # SSE real-time stream
    ├── analytics.ejs      # Hourly/level/trend/top-services charts
    └── 404.ejs
```

## API Reference

### Ingest logs
```bash
POST /api/logs
X-Api-Key: <your-key>
Content-Type: application/json

{
  "appName": "myapp",
  "logs": [
    "{\"level\":\"info\",\"message\":\"Server started\",\"appName\":\"myapp\"}"
  ]
}
```

### Search logs
```
GET /api/logs/search?service=myapp&date=2024-01-15&level=error&q=timeout
```

### Replay last N minutes
```
GET /api/logs/replay?minutes=30
```

### Download filtered log
```
GET /api/logs/download/myapp/2024-01-15?level=error&q=timeout
```

### Analytics
```
GET /api/analytics/overview
GET /api/analytics/hourly?service=myapp&date=2024-01-15
GET /api/analytics/levels?service=myapp&date=2024-01-15
GET /api/analytics/trend?service=myapp&days=7
GET /api/analytics/top-services?date=2024-01-15&top=10
GET /api/analytics/recent-errors?limit=20
```

### Health
```
GET /api/health
GET /api/health/metrics   # Prometheus-style metrics
```

## Environment Variables

| Variable         | Default                      | Description                        |
|-----------------|------------------------------|------------------------------------|
| PORT            | 9900                         | HTTP port                          |
| JWT_SECRET      | (dev default)                | ≥32 chars in production            |
| API_KEY         | change-me-secret-key         | Ingest API key                     |
| LOG_BASE_DIR    | ./logs                       | Log storage directory              |
| RETENTION_DAYS  | 7                            | Days to keep logs                  |
| ENABLE_STREAM   | true                         | Enable SSE stream                  |
| WEBHOOK_URL     | (empty)                      | Webhook URL for error alerts       |
| CORS_ORIGINS    | http://localhost:9900        | Comma-separated allowed origins    |

## Log Format (Structured JSON)

```json
{
  "ts": "2024-01-15T10:23:45.000Z",
  "level": "error",
  "appName": "payment-service",
  "message": "Database connection failed",
  "requestId": "abc-123",
  "duration": 1523
}
```

Logs are stored at: `logs/<appName>/<date>.log`
