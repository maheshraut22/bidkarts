// src/lib/auth.ts - JWT Authentication utilities
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface UserPayload extends JWTPayload {
  id: number
  email: string
  name: string
  role: 'customer' | 'vendor' | 'expert' | 'admin'
}

const JWT_SECRET_KEY = 'bidkarts-secret-key-2024-change-in-production'

export async function getJWTSecret(): Promise<Uint8Array> {
  return new TextEncoder().encode(JWT_SECRET_KEY)
}

export async function signToken(payload: UserPayload, expiresIn = '7d'): Promise<string> {
  const secret = await getJWTSecret()
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
  return token
}

export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const secret = await getJWTSecret()
    const { payload } = await jwtVerify(token, secret)
    return payload as UserPayload
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'bidkarts-salt')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const hashedInput = await hashPassword(password)
  return hashedInput === hash
}

export function extractToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}
