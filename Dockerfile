# =============================================================================
# BidKarts Dockerfile - Multi-stage build for AWS ECS deployment
# =============================================================================

# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy package files first (Docker layer cache optimization)
COPY package.json package-lock.json ./

# Install ALL dependencies (dev + prod needed for build)
RUN npm ci --no-audit --no-fund

# Copy TypeScript config files
COPY tsconfig.json tsconfig.server.json* ./

# Copy source code
COPY src/ ./src/
COPY server.ts ./
COPY public/ ./public/

# Build the Vite frontend bundle (creates dist/)
RUN npm run build

# Verify build output
RUN ls -la dist/ && echo "Build successful"

# ─── Stage 2: Production Image ───────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install production system dependencies
RUN apk add --no-cache \
    wget \
    curl \
    tini

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Copy static public files
COPY --from=builder /app/public ./public

# Copy source files (tsx runs TypeScript directly - avoids separate compile step)
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts

# Copy TypeScript config for tsx runtime
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY tsconfig.server.json* ./

# Copy database migrations
COPY migrations/ ./migrations/

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs bidkarts && \
    chown -R bidkarts:nodejs /app

USER bidkarts

# Expose port
EXPOSE 3000

# Health check using wget (already installed via apk)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Use tini as init process for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the server with tsx (TypeScript runner - handles ts files directly)
CMD ["node_modules/.bin/tsx", "server.ts"]
