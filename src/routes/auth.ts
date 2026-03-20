// src/routes/auth.ts - Authentication routes (with OAuth support)
import { Hono } from 'hono'
import { signToken, hashPassword, verifyPassword } from '../lib/auth'
import { sendEmailNotification } from '../lib/db'
import type { Env } from '../lib/db'

const auth = new Hono<{ Bindings: Env }>()

// POST /api/auth/register
auth.post('/register', async (c) => {
  try {
    const body = await c.req.json()
    const { name, email, phone, password, role, address, referral_code,
      company_name, owner_name, service_area, certifications, services_offered,
      experience_years, certification, experience } = body

    if (!name || !email || !password || !role) {
      return c.json({ error: 'Name, email, password and role are required' }, 400)
    }
    if (!['customer', 'vendor', 'expert'].includes(role)) {
      return c.json({ error: 'Invalid role' }, 400)
    }
    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400)
    }

    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    // Generate unique referral code for new user
    const newReferralCode = 'BK' + Math.random().toString(36).substring(2, 7).toUpperCase()
    const passwordHash = await hashPassword(password)
    const result = await c.env.DB.prepare(
      `INSERT INTO users (name, email, phone, password_hash, role, address, is_verified, is_active, referral_code) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`
    ).bind(name, email, phone || null, passwordHash, role, address || null, newReferralCode).run()

    const userId = result.meta.last_row_id as number

    // Handle referral code if provided
    if (referral_code) {
      try {
        const referrer = await c.env.DB.prepare(
          'SELECT id, name FROM users WHERE referral_code = ? AND id != ?'
        ).bind(referral_code.toUpperCase(), userId).first() as any
        if (referrer) {
          await c.env.DB.prepare(
            'INSERT INTO referrals (referrer_id, referred_id, status) VALUES (?, ?, ?) ON CONFLICT (referred_id) DO NOTHING'
          ).bind(referrer.id, userId, 'completed').run()
          // Notify referrer
          await c.env.DB.prepare(
            `INSERT INTO notifications (user_id, title, message, type, related_id, related_type) VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(referrer.id, '🎉 Referral Bonus!', `${name} joined BidKarts using your referral code!`, 'referral', userId, 'user').run()
        }
      } catch {} // Don't fail registration if referral fails
    }

    if (role === 'vendor') {
      await c.env.DB.prepare(
        `INSERT INTO vendor_profiles (user_id, company_name, owner_name, service_area, certifications, experience_years, services_offered) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(userId, company_name || name, owner_name || name, service_area || '', certifications || '', experience_years || 0, services_offered || '').run()
    }

    if (role === 'expert') {
      await c.env.DB.prepare(
        `INSERT INTO expert_profiles (user_id, certification, experience, service_area) VALUES (?, ?, ?, ?)`
      ).bind(userId, certification || '', experience || 0, service_area || '').run()
    }

    // Send welcome email
    await sendEmailNotification(c.env, {
      to: email,
      subject: `Welcome to BidKarts, ${name}! 🎉`,
      template: 'welcome',
      data: { name, role }
    })

    const token = await signToken({ id: userId, email, name, role, iat: 0, exp: 0 })
    return c.json({ token, user: { id: userId, name, email, role }, message: 'Registration successful' }, 201)
  } catch (e: any) {
    return c.json({ error: e.message || 'Registration failed' }, 500)
  }
})

// POST /api/auth/login
auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

    const user = await c.env.DB.prepare(
      'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ?'
    ).bind(email).first() as any

    if (!user || !user.is_active) return c.json({ error: 'Invalid credentials' }, 401)
    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

    let profile = null
    if (user.role === 'vendor') {
      profile = await c.env.DB.prepare('SELECT * FROM vendor_profiles WHERE user_id = ?').bind(user.id).first()
    }
    if (user.role === 'expert') {
      profile = await c.env.DB.prepare('SELECT * FROM expert_profiles WHERE user_id = ?').bind(user.id).first()
    }

    const token = await signToken({ id: user.id, email: user.email, name: user.name, role: user.role, iat: 0, exp: 0 })
    return c.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, profile }
    })
  } catch (e: any) {
    return c.json({ error: e.message || 'Login failed' }, 500)
  }
})

// GET /api/auth/me
auth.get('/me', async (c) => {
  try {
    const { verifyToken, extractToken } = await import('../lib/auth')
    const token = extractToken(c.req.header('Authorization') || null)
    if (!token) return c.json({ error: 'Unauthorized' }, 401)
    const payload = await verifyToken(token)
    if (!payload) return c.json({ error: 'Invalid token' }, 401)

    const user = await c.env.DB.prepare(
      'SELECT id, name, email, phone, role, address, avatar_url, is_verified, created_at FROM users WHERE id = ?'
    ).bind(payload.id).first() as any

    let profile = null
    if (user.role === 'vendor') {
      profile = await c.env.DB.prepare('SELECT * FROM vendor_profiles WHERE user_id = ?').bind(user.id).first()
    }
    if (user.role === 'expert') {
      profile = await c.env.DB.prepare('SELECT * FROM expert_profiles WHERE user_id = ?').bind(user.id).first()
    }

    return c.json({ user: { ...user, profile } })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/auth/oauth/google - OAuth login/register with Google
auth.post('/oauth/google', async (c) => {
  try {
    const { id_token, role } = await c.req.json()

    if (!id_token) return c.json({ error: 'Google ID token required' }, 400)

    // Verify Google token by calling Google's tokeninfo endpoint
    let googlePayload: any = null
    try {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`)
      if (!verifyRes.ok) {
        return c.json({ error: 'Invalid Google token' }, 401)
      }
      googlePayload = await verifyRes.json()
    } catch (e) {
      return c.json({ error: 'Failed to verify Google token' }, 401)
    }

    if (!googlePayload.email) return c.json({ error: 'Could not get email from Google' }, 400)

    const { email, name, picture, sub: googleId } = googlePayload

    // Check if user already exists
    let user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() as any

    if (user) {
      // Existing user - login
      if (!user.is_active) return c.json({ error: 'Account is deactivated' }, 403)

      // Update avatar if not set
      if (!user.avatar_url && picture) {
        await c.env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(picture, user.id).run()
      }
    } else {
      // New user - register
      if (!role || !['customer', 'vendor', 'expert'].includes(role)) {
        // Return 'needs_role' so frontend can ask for role selection
        return c.json({
          needs_role: true,
          google_data: { email, name, picture, google_id: googleId }
        })
      }

      const dummyHash = await hashPassword(googleId + 'oauth')
      const result = await c.env.DB.prepare(
        `INSERT INTO users (name, email, password_hash, role, avatar_url, is_verified, is_active) VALUES (?, ?, ?, ?, ?, 1, 1)`
      ).bind(name, email, dummyHash, role, picture || null).run()

      const userId = result.meta.last_row_id as number

      if (role === 'vendor') {
        await c.env.DB.prepare(
          `INSERT INTO vendor_profiles (user_id, company_name, owner_name) VALUES (?, ?, ?)`
        ).bind(userId, name, name).run()
      }
      if (role === 'expert') {
        await c.env.DB.prepare(
          `INSERT INTO expert_profiles (user_id, certification, experience) VALUES (?, ?, ?)`
        ).bind(userId, '', 0).run()
      }

      // Send welcome email
      await sendEmailNotification(c.env, {
        to: email,
        subject: `Welcome to BidKarts, ${name}! 🎉`,
        template: 'welcome',
        data: { name, role }
      })

      user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first() as any
    }

    let profile = null
    if (user.role === 'vendor') {
      profile = await c.env.DB.prepare('SELECT * FROM vendor_profiles WHERE user_id = ?').bind(user.id).first()
    }
    if (user.role === 'expert') {
      profile = await c.env.DB.prepare('SELECT * FROM expert_profiles WHERE user_id = ?').bind(user.id).first()
    }

    const token = await signToken({ id: user.id, email: user.email, name: user.name, role: user.role, iat: 0, exp: 0 })
    return c.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url, profile }
    })
  } catch (e: any) {
    return c.json({ error: e.message || 'OAuth login failed' }, 500)
  }
})

// POST /api/auth/oauth/google/complete - Complete OAuth registration with role selection
auth.post('/oauth/google/complete', async (c) => {
  try {
    const { email, name, picture, google_id, role, company_name, service_area, certification } = await c.req.json()

    if (!email || !role) return c.json({ error: 'Email and role required' }, 400)
    if (!['customer', 'vendor', 'expert'].includes(role)) return c.json({ error: 'Invalid role' }, 400)

    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    const dummyHash = await hashPassword((google_id || email) + 'oauth')
    const result = await c.env.DB.prepare(
      `INSERT INTO users (name, email, password_hash, role, avatar_url, is_verified, is_active) VALUES (?, ?, ?, ?, ?, 1, 1)`
    ).bind(name, email, dummyHash, role, picture || null).run()

    const userId = result.meta.last_row_id as number

    if (role === 'vendor') {
      await c.env.DB.prepare(
        `INSERT INTO vendor_profiles (user_id, company_name, owner_name, service_area) VALUES (?, ?, ?, ?)`
      ).bind(userId, company_name || name, name, service_area || '').run()
    }
    if (role === 'expert') {
      await c.env.DB.prepare(
        `INSERT INTO expert_profiles (user_id, certification, experience) VALUES (?, ?, ?)`
      ).bind(userId, certification || '', 0).run()
    }

    await sendEmailNotification(c.env, {
      to: email,
      subject: `Welcome to BidKarts, ${name}! 🎉`,
      template: 'welcome',
      data: { name, role }
    })

    const token = await signToken({ id: userId, email, name, role, iat: 0, exp: 0 })
    return c.json({ token, user: { id: userId, name, email, role, avatar_url: picture || null } }, 201)
  } catch (e: any) {
    return c.json({ error: e.message || 'OAuth completion failed' }, 500)
  }
})

export default auth
