// src/lib/pg.ts - PostgreSQL database pool (replaces Cloudflare D1)
import { Pool, type PoolClient } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }

    // Determine SSL mode from connection string or environment
    // - sslmode=disable  → no SSL (Docker local, same-VPC RDS)
    // - sslmode=require  → SSL required (AWS RDS from outside VPC)
    // - default for production + not localhost → SSL with rejectUnauthorized:false
    const sslDisabled = connectionString.includes('sslmode=disable') ||
      connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1') ||
      connectionString.includes('postgres:') // Docker Compose service name
    const sslConfig = sslDisabled
      ? false
      : process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false

    pool = new Pool({
      connectionString,
      ssl: sslConfig,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message)
    })

    pool.on('connect', () => {
      console.log('[DB] New client connected to PostgreSQL')
    })
  }
  return pool
}

// ── D1-compatible wrapper ─────────────────────────────────────────────────────
// This mimics the Cloudflare D1 API so existing route code works unchanged
// after simply swapping `c.env.DB` for `getDB()`

export type D1LikeResult = {
  results: any[]
  meta: { last_row_id: number | null; changes: number }
}

function convertPlaceholders(sql: string): string {
  // Convert SQLite ? placeholders to PostgreSQL $1, $2, ... placeholders
  let idx = 0
  return sql.replace(/\?/g, () => `$${++idx}`)
}

function makeStmt(sql: string, boundArgs: any[] = []) {
  const pgSql = convertPlaceholders(sql)
  return {
    bind: (...args: any[]) => makeStmt(sql, [...boundArgs, ...args]),

    async first<T = any>(): Promise<T | null> {
      const client = getPool()
      try {
        const res = await client.query(pgSql, boundArgs)
        return (res.rows[0] as T) ?? null
      } catch (e: any) {
        console.error('[DB] query error:', e.message, '\nSQL:', pgSql)
        throw e
      }
    },

    async all<T = any>(): Promise<{ results: T[] }> {
      const client = getPool()
      try {
        const res = await client.query(pgSql, boundArgs)
        return { results: res.rows as T[] }
      } catch (e: any) {
        console.error('[DB] query error:', e.message, '\nSQL:', pgSql)
        throw e
      }
    },

    async run(): Promise<{ meta: { last_row_id: number | null; changes: number } }> {
      const client = getPool()
      // For INSERT with RETURNING id, attach RETURNING id clause if not present
      let finalSql = pgSql
      const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT')
      const hasReturning = pgSql.toUpperCase().includes('RETURNING')
      if (isInsert && !hasReturning) {
        finalSql = pgSql + ' RETURNING id'
      }
      try {
        const res = await client.query(finalSql, boundArgs)
        const lastId = isInsert && res.rows.length > 0 ? (res.rows[0].id ?? null) : null
        return { meta: { last_row_id: lastId, changes: res.rowCount ?? 0 } }
      } catch (e: any) {
        console.error('[DB] run error:', e.message, '\nSQL:', finalSql)
        throw e
      }
    },
  }
}

export function getDB() {
  return {
    prepare: (sql: string) => makeStmt(sql),

    // Transaction support
    async transaction<T>(fn: (tx: ReturnType<typeof getDB>) => Promise<T>): Promise<T> {
      const client: PoolClient = await getPool().connect()
      try {
        await client.query('BEGIN')
        const txDB = makeTxDB(client)
        const result = await fn(txDB)
        await client.query('COMMIT')
        return result
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    },
  }
}

function makeTxDB(client: PoolClient) {
  function makeTxStmt(sql: string, boundArgs: any[] = []) {
    const pgSql = convertPlaceholders(sql)
    return {
      bind: (...args: any[]) => makeTxStmt(sql, [...boundArgs, ...args]),

      async first<T = any>(): Promise<T | null> {
        const res = await client.query(pgSql, boundArgs)
        return (res.rows[0] as T) ?? null
      },

      async all<T = any>(): Promise<{ results: T[] }> {
        const res = await client.query(pgSql, boundArgs)
        return { results: res.rows as T[] }
      },

      async run(): Promise<{ meta: { last_row_id: number | null; changes: number } }> {
        let finalSql = pgSql
        const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT')
        if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
          finalSql = pgSql + ' RETURNING id'
        }
        const res = await client.query(finalSql, boundArgs)
        const lastId = isInsert && res.rows.length > 0 ? (res.rows[0].id ?? null) : null
        return { meta: { last_row_id: lastId, changes: res.rowCount ?? 0 } }
      },
    }
  }

  return {
    prepare: (sql: string) => makeTxStmt(sql),
    transaction: async <T>(fn: any): Promise<T> => fn(makeTxDB(client)),
  }
}

export type DBClient = ReturnType<typeof getDB>
