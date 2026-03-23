# =============================================================================
# BidKarts Dockerfile - Production-ready Multi-stage build
# Compatible with: Docker 20+, Node.js 20, AWS ECS Fargate
# =============================================================================

# ─── Stage 1: Dependencies + Build ───────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install OS build tools needed by native modules (pg, etc.)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy only package manifests first for layer caching
COPY package.json package-lock.json* ./

# Install ALL dependencies (dev + prod required for the build step)
# Using npm install (not npm ci) to handle lockfile version differences
RUN npm install --no-audit --no-fund

# Copy TypeScript configs
COPY tsconfig.json ./
COPY tsconfig.server.json ./
COPY vite.config.ts ./
# Copy application source
COPY src/ ./src/
COPY server.ts ./
COPY public/ ./public/

# Build Vite frontend → generates dist/
RUN npm run build && echo "✅ Build complete" && ls -la dist/

# ─── Stage 2: Production Runtime ─────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install minimal runtime OS packages
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    tini \
    wget

# Copy package manifests
COPY package.json package-lock.json* ./

# Install ALL dependencies (tsx is a devDep but needed as the runtime TypeScript runner)
RUN npm install --no-audit --no-fund && \
    npm cache clean --force

# Copy built Vite assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy static files
COPY --from=builder /app/public ./public

# Copy TypeScript source (tsx executes it directly — no pre-compilation needed)
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts

# Copy TS config files (required by tsx at runtime)
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/tsconfig.server.json ./tsconfig.server.json

# Copy database migration files
COPY migrations/ ./migrations/

# ── Environment defaults ──────────────────────────────────────────────────────
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# ── Security: run as non-root user ───────────────────────────────────────────
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S -u 1001 -G nodejs bidkarts && \
    chown -R bidkarts:nodejs /app

USER bidkarts

# ── Networking ────────────────────────────────────────────────────────────────
EXPOSE 3000

# ── Health check ─────────────────────────────────────────────────────────────
HEALTHCHECK \
    --interval=30s \
    --timeout=10s \
    --start-period=60s \
    --retries=5 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

# ── Startup ───────────────────────────────────────────────────────────────────
# tini = PID-1 init; handles SIGTERM/SIGINT correctly for graceful ECS shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/tsx", "server.ts"]
