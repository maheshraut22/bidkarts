#!/usr/bin/env bash
# =============================================================================
# BidKarts - Local Development Setup Script
# Usage: ./scripts/setup-local.sh
#        npm run setup:local
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
fail() { echo -e "${RED}❌ $*${NC}"; exit 1; }

echo ""
echo -e "${BLUE}🚀 BidKarts Local Setup${NC}"
echo ""

# Check prerequisites
command -v docker   >/dev/null 2>&1 || fail "Docker is not installed. Install from https://www.docker.com/get-started"
command -v docker   >/dev/null 2>&1 && docker info >/dev/null 2>&1 || fail "Docker daemon is not running. Start Docker Desktop."
command -v docker   >/dev/null 2>&1 && (docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1) || fail "Docker Compose not found."

# Create .env if not exists
if [[ ! -f .env ]]; then
  log "Creating .env from .env.example..."
  cp .env.example .env
  ok ".env created — review and update values if needed"
else
  ok ".env already exists"
fi

# Stop any running containers
log "Stopping existing containers..."
docker compose down 2>/dev/null || true

# Build app image
log "Building BidKarts Docker image (this takes 2-4 minutes on first run)..."
docker compose build --no-cache app
ok "Docker image built"

# Start PostgreSQL first
log "Starting PostgreSQL..."
docker compose up -d postgres
log "Waiting for PostgreSQL to be ready..."
timeout 60 bash -c 'until docker compose exec postgres pg_isready -U bidkarts -d bidkarts >/dev/null 2>&1; do sleep 2; echo "  waiting..."; done'
ok "PostgreSQL is ready"

# Start app
log "Starting BidKarts application..."
docker compose up -d app
log "Waiting for app to be healthy (30-60 seconds)..."
timeout 90 bash -c 'until docker compose exec app wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; do sleep 3; echo "  waiting..."; done' || {
  warn "App health check timed out — checking logs:"
  docker compose logs app --tail=30
  exit 1
}
ok "Application is running"

# Seed database
log "Seeding database with demo data..."
sleep 2
SEED_RESULT=$(docker compose exec app wget -qO- http://localhost:3000/api/setup 2>/dev/null || curl -sf http://localhost:3000/api/setup 2>/dev/null || echo '{"error":"seed_failed"}')
if echo "$SEED_RESULT" | grep -q '"status":"ok"'; then
  ok "Database seeded successfully!"
else
  warn "Seed response: $SEED_RESULT"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     BidKarts is running locally! 🎉       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}App URL:${NC}      http://localhost:3000"
echo -e "  ${BLUE}Health:${NC}       http://localhost:3000/api/health"
echo ""
echo -e "  ${YELLOW}Demo Login Credentials:${NC}"
echo -e "  Admin:    admin@bidkarts.com    / Admin@123"
echo -e "  Customer: customer@bidkarts.com / Customer@123"
echo -e "  Vendor:   vendor@bidkarts.com   / Vendor@123"
echo -e "  Expert:   expert@bidkarts.com   / Expert@123"
echo ""
echo -e "  ${BLUE}Useful commands:${NC}"
echo -e "  View logs:    docker compose logs -f app"
echo -e "  Stop:         docker compose down"
echo -e "  Restart app:  docker compose restart app"
echo -e "  DB console:   docker compose exec postgres psql -U bidkarts bidkarts"
echo ""
