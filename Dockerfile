# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL deps (including devDeps for build)
RUN npm ci

# Copy source
COPY tsconfig.json tsconfig.server.json* ./
COPY src/ ./src/
COPY server.ts ./
COPY public/ ./public/

# Build the Vite frontend bundle
RUN npm run build

# Compile server.ts → dist-server/server.js
RUN npx tsc --project tsconfig.server.json 2>/dev/null || \
    npx tsc --outDir dist-server --module commonjs --target es2020 \
      --esModuleInterop --skipLibCheck --resolveJsonModule server.ts \
      src/index.tsx src/lib/pg.ts src/lib/auth.ts src/lib/db.ts \
      src/middleware/auth.ts \
      src/routes/auth.ts src/routes/projects.ts src/routes/bids.ts \
      src/routes/users.ts src/routes/inspections.ts src/routes/payments.ts \
      src/routes/admin.ts src/routes/documents.ts src/routes/messages.ts \
      src/routes/milestones.ts src/routes/ai.ts src/routes/consultations.ts \
      src/routes/disputes.ts src/routes/shortlist.ts 2>/dev/null || true

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install only production deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Copy source (tsx runs TypeScript directly in production)
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts

# Copy migrations
COPY migrations/ ./migrations/

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start using tsx (TypeScript runner) 
CMD ["npx", "tsx", "server.ts"]
