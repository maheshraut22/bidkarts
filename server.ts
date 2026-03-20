// server.ts - Node.js HTTP server entry point for AWS deployment
// This file starts the Hono app using @hono/node-server instead of Cloudflare Workers
import 'dotenv/config'
import { serve } from '@hono/node-server'
import app from './src/index'

const PORT = parseInt(process.env.PORT || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'

console.log(`[BidKarts] Starting Node.js server...`)
console.log(`[BidKarts] NODE_ENV: ${process.env.NODE_ENV || 'development'}`)
console.log(`[BidKarts] DATABASE_URL: ${process.env.DATABASE_URL ? '✓ set' : '✗ NOT SET'}`)

serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  },
  (info) => {
    console.log(`[BidKarts] ✅ Server listening on http://${HOST}:${info.port}`)
    console.log(`[BidKarts] Health check: http://${HOST}:${info.port}/api/health`)
    console.log(`[BidKarts] DB setup:     http://${HOST}:${info.port}/api/setup`)
  }
)

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[BidKarts] SIGTERM received — shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[BidKarts] SIGINT received — shutting down gracefully')
  process.exit(0)
})
