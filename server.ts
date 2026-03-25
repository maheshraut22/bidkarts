// server.ts - Node.js HTTP server entry point for AWS / local deployment
// Uses @hono/node-server to run the Hono app outside Cloudflare Workers.
import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import appRoutes from './src/index'

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'

// ⚠️ FIX: Create a fresh top-level Hono instance so static middleware
// is registered BEFORE any routes (including the catch-all * in src/index).
// Hono matches in registration order — if the catch-all lands first,
// every request for app.js / manifest.json / assets/* gets index.html back.
const server = new Hono()

// 1️⃣ Vite build output — serves app.js, manifest.json, assets/*, etc.
server.use('/*', serveStatic({ root: './dist' }))

// 2️⃣ Legacy /static/* route from public/ (kept for backward compatibility)
server.use('/static/*', serveStatic({ root: './public' }))

// 3️⃣ API routes + SPA catch-all (must come last)
server.route('/', appRoutes)

console.log(`[BidKarts] Starting Node.js server...`)
console.log(`[BidKarts] NODE_ENV    : ${process.env.NODE_ENV || 'development'}`)
console.log(`[BidKarts] DATABASE_URL: ${process.env.DATABASE_URL ? '✓ set' : '✗ NOT SET – DB calls will fail'}`)

serve(
  {
    fetch: server.fetch,
    port: PORT,
    hostname: HOST,
  },
  (info) => {
    console.log(`[BidKarts] ✅ Server listening on http://${HOST}:${info.port}`)
    console.log(`[BidKarts] Health:   http://${HOST}:${info.port}/api/health`)
    console.log(`[BidKarts] DB setup: http://${HOST}:${info.port}/api/setup  (run once)`)
  }
)

// Graceful shutdown
process.on('SIGTERM', () => { console.log('[BidKarts] SIGTERM → shutting down'); process.exit(0) })
process.on('SIGINT',  () => { console.log('[BidKarts] SIGINT  → shutting down'); process.exit(0) })