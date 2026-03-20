// src/middleware/auth.ts - Authentication middleware
import { createMiddleware } from 'hono/factory'
import { verifyToken, extractToken, type UserPayload } from '../lib/auth'

type Variables = {
  user: UserPayload
}

export const authMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const token = extractToken(c.req.header('Authorization') || null)
  if (!token) {
    return c.json({ error: 'Unauthorized - No token provided' }, 401)
  }
  const payload = await verifyToken(token)
  if (!payload) {
    return c.json({ error: 'Unauthorized - Invalid token' }, 401)
  }
  c.set('user', payload)
  await next()
})

export const requireRole = (...roles: string[]) => {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get('user')
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden - Insufficient permissions' }, 403)
    }
    await next()
  })
}

export const optionalAuth = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const token = extractToken(c.req.header('Authorization') || null)
  if (token) {
    const payload = await verifyToken(token)
    if (payload) c.set('user', payload)
  }
  await next()
})
