"use strict";
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");
const config = require("./config");
const { scheduleCleanup } = require("./lib/cleanup");
const { closeAllStreams } = require("./lib/streams");
const BatchWriter = require("./lib/batchWriter");
const logger = require("./lib/logger");

// Routes
const healthRoute = require("./routes/health");
const authRoute = require("./routes/auth");
const logsRoute = require("./routes/logs");
const streamRoute = require("./routes/stream");
const logsListingRoute = require("./routes/logsListing");
const filesRoute = require("./routes/files");
const statsRoute = require("./routes/stats");

const app = express();

// CSP that allows EventSource (connect-src) and inline scripts/event handlers (for simplicity)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"], // allows EventSource
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  }),
);

// ── CORS ───────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    !origin ||
    config.CORS_ORIGINS.includes("*") ||
    config.CORS_ORIGINS.includes(origin)
  ) {
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Api-Key, Authorization",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Body / cookies ─────────────────────────────────────────────────────────
app.use(express.json({ limit: config.MAX_BODY_SIZE }));
app.use(cookieParser());

// ── Request logger ─────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── Static ──────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Routes  (ORDER MATTERS — more specific paths first) ────────────────────
app.use("/health", healthRoute);
app.use("/auth", authRoute);
app.use("/stats", statsRoute);

// Stream MUST be mounted before the generic /logs ingest router
app.use("/logs/stream", streamRoute);
app.use("/logs/list", logsListingRoute);
app.use("/logs", logsRoute.router);
app.use("/files", filesRoute);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── Global error handler ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: "Internal server error" });
});

// ── Batch writer ───────────────────────────────────────────────────────────
const batchWriter = new BatchWriter();
const { setBatchWriter } = require("./routes/logs");
setBatchWriter(batchWriter);

// ── Scheduled jobs ─────────────────────────────────────────────────────────
scheduleCleanup();

// ── Start server ───────────────────────────────────────────────────────────
const server = app.listen(config.PORT, () => {
  logger.info(`Log aggregator listening on port ${config.PORT}`);
  logger.info(`Environment : ${config.NODE_ENV}`);
  logger.info(`Log base dir: ${config.LOG_BASE_DIR}`);
  logger.info(
    `Batching    : size=${config.BATCH_SIZE}, timeout=${config.BATCH_TIMEOUT}ms`,
  );
  logger.info(`Stream SSE  : ${config.ENABLE_STREAM}`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down gracefully…`);

  // Stop accepting new connections
  server.close(async () => {
    try {
      await batchWriter.flushAll();
    } catch (err) {
      logger.error(`Flush error: ${err.message}`);
    }
    closeAllStreams();
    logger.info("Shutdown complete.");
    process.exit(0);
  });

  // Force exit after 10 s if something hangs
  setTimeout(() => {
    logger.error("Forced exit after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught: ${err.stack}`);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (r) => {
  logger.error(`Unhandled rejection: ${r}`);
});
