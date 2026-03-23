// server.ts - Node.js HTTP server entry point for AWS / local deployment
// Uses @hono/node-server to run the Hono app outside Cloudflare Workers.
import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './src/index'

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'

// Add Node.js static file serving (Cloudflare serves these from public/ automatically)
app.use('/static/*', serveStatic({ root: './public' }))

console.log(`[BidKarts] Starting Node.js server...`)
console.log(`[BidKarts] NODE_ENV    : ${process.env.NODE_ENV || 'development'}`)
console.log(`[BidKarts] DATABASE_URL: ${process.env.DATABASE_URL ? '✓ set' : '✗ NOT SET – DB calls will fail'}`)

serve(
  {
    fetch: app.fetch,
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
