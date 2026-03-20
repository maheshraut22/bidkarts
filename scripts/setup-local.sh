#!/usr/bin/env bash
# =============================================================================
# BidKarts - Local PostgreSQL Development Setup
# Starts a local PostgreSQL via Docker and seeds the database
# Usage: ./scripts/setup-local.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅${NC} $*"; }
warn() { echo -e "${YELLOW}⚠️${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# ── Check .env exists ────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  log "Creating .env from .env.example..."
  cp .env.example .env
  warn "Review and update .env with your actual credentials before proceeding."
fi

# ── Start PostgreSQL via Docker ───────────────────────────────────────────────
log "Starting PostgreSQL container..."
docker compose up postgres -d

log "Waiting for PostgreSQL to be ready..."
until docker compose exec -T postgres pg_isready -U bidkarts -d bidkarts >/dev/null 2>&1; do
  echo -n "."
  sleep 2
done
echo ""
ok "PostgreSQL is ready!"

# ── Install Node dependencies ────────────────────────────────────────────────
if [[ ! -d node_modules ]]; then
  log "Installing dependencies..."
  npm install
fi

# ── Build frontend ───────────────────────────────────────────────────────────
log "Building frontend..."
npm run build

# ── Start the application ────────────────────────────────────────────────────
log "Starting BidKarts server..."
npx tsx server.ts &
APP_PID=$!

sleep 3

# ── Run database setup ───────────────────────────────────────────────────────
log "Running database migrations and seed data..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/setup 2>/dev/null || echo "000")
if [[ "$RESPONSE" == "200" ]]; then
  ok "Database initialized!"
else
  warn "Could not auto-run setup (HTTP ${RESPONSE}). Try: curl http://localhost:3000/api/setup"
fi

echo ""
echo -e "${GREEN}═════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉  BidKarts is running locally!${NC}"
echo -e "${GREEN}═════════════════════════════════════════════════${NC}"
echo ""
echo -e "  App:     ${BLUE}http://localhost:3000${NC}"
echo -e "  Health:  ${BLUE}http://localhost:3000/api/health${NC}"
echo -e "  DB Setup: ${BLUE}http://localhost:3000/api/setup${NC}"
echo ""
echo -e "  ${YELLOW}Demo Accounts:${NC}"
echo -e "  Admin:    admin@bidkarts.com    / Admin@123"
echo -e "  Customer: customer@bidkarts.com / Customer@123"
echo -e "  Vendor:   vendor@bidkarts.com   / Vendor@123"
echo -e "  Expert:   expert@bidkarts.com   / Expert@123"
echo ""
echo "Press Ctrl+C to stop..."
wait $APP_PID
