FROM node:20-alpine

LABEL org.opencontainers.image.title="Blorq"
LABEL org.opencontainers.image.description="Production-grade log aggregator"
LABEL org.opencontainers.image.source="https://github.com/your-org/blorq"

WORKDIR /app

# Install deps first (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy source
COPY . .

# Create data + logs dirs
RUN mkdir -p /data /logs

ENV NODE_ENV=production
ENV PORT=9900
ENV DATA_DIR=/data
ENV LOG_BASE_DIR=/logs

EXPOSE 9900

VOLUME ["/data", "/logs"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:9900/api/health || exit 1

CMD ["node", "server.js"]
