// src/routes/users.ts - User & vendor profile routes
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification, sendEmailNotification, sanitize } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const users = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/users/vendors - List approved vendors
users.get('/vendors', async (c) => {
  try {
    const { service_type, rating, search, page = '1' } = c.req.query()
    const limit = 12, offset = (parseInt(page) - 1) * limit
    let query = `
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url,
        vp.company_name, vp.owner_name, vp.service_area, vp.certifications,
        vp.experience_years, vp.services_offered, vp.rating, vp.total_reviews,
        vp.total_projects, vp.description, vp.logo_url, vp.is_approved,
        vp.portfolio_images, vp.specializations, vp.subscription_plan
      FROM users u
      JOIN vendor_profiles vp ON vp.user_id = u.id
      WHERE u.role = 'vendor' AND u.is_active = 1 AND vp.is_approved = 1
    `
    const params: any[] = []
    if (service_type) { query += ' AND vp.services_offered LIKE ?'; params.push(`%${service_type}%`) }
    if (rating) { query += ' AND vp.rating >= ?'; params.push(parseFloat(rating)) }
    if (search) { query += ' AND (vp.company_name LIKE ? OR u.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    // Featured/premium vendors first
    query += ' ORDER BY vp.subscription_plan DESC, vp.rating DESC, vp.total_reviews DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ vendors: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/users/vendors/:id - Get vendor profile
users.get('/vendors/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const vendor = await c.env.DB.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.created_at,
        vp.company_name, vp.owner_name, vp.service_area, vp.certifications,
        vp.experience_years, vp.services_offered, vp.rating, vp.total_reviews,
        vp.total_projects, vp.description, vp.logo_url, vp.website,
        vp.portfolio_images, vp.specializations, vp.subscription_plan
      FROM users u
      JOIN vendor_profiles vp ON vp.user_id = u.id
      WHERE u.id = ? AND u.role = 'vendor'
    `).bind(id).first()
    if (!vendor) return c.json({ error: 'Vendor not found' }, 404)

    const reviews = await c.env.DB.prepare(`
      SELECT r.*, u.name as reviewer_name, p.title as project_title
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      JOIN projects p ON r.project_id = p.id
      WHERE r.vendor_id = ?
      ORDER BY r.created_at DESC LIMIT 10
    `).bind(id).all()

    return c.json({ vendor, reviews: reviews.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/users/profile - Get own profile
users.get('/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const profile = await c.env.DB.prepare(
      'SELECT id, name, email, phone, role, address, avatar_url, is_verified, created_at FROM users WHERE id = ?'
    ).bind(user.id).first() as any

    let extraProfile: any = null
    if (profile.role === 'vendor') {
      extraProfile = await c.env.DB.prepare('SELECT * FROM vendor_profiles WHERE user_id = ?').bind(user.id).first()
    } else if (profile.role === 'expert') {
      extraProfile = await c.env.DB.prepare('SELECT * FROM expert_profiles WHERE user_id = ?').bind(user.id).first()
    }

    return c.json({ user: { ...profile, profile: extraProfile } })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/users/profile - Update own profile (customer + vendor + expert)
users.patch('/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const {
      name, phone, address, avatar_url,
      // vendor fields
      company_name, service_area, description, experience_years,
      certifications, services_offered, logo_url, website,
      portfolio_images, specializations,
      // expert fields
      certification, expertise_area
    } = body

    // Update base user
    const baseUpdates: string[] = [], baseVals: any[] = []
    if (name)       { baseUpdates.push('name = ?');       baseVals.push(sanitize(name)) }
    if (phone)      { baseUpdates.push('phone = ?');      baseVals.push(sanitize(phone)) }
    if (address)    { baseUpdates.push('address = ?');    baseVals.push(sanitize(address)) }
    if (avatar_url) { baseUpdates.push('avatar_url = ?'); baseVals.push(avatar_url) }
    if (baseUpdates.length > 0) {
      baseVals.push(user.id)
      await c.env.DB.prepare(`UPDATE users SET ${baseUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...baseVals).run()
    }

    // Update vendor profile
    if (user.role === 'vendor') {
      const vUpdates: string[] = [], vVals: any[] = []
      if (company_name)     { vUpdates.push('company_name = ?');     vVals.push(sanitize(company_name)) }
      if (service_area)     { vUpdates.push('service_area = ?');     vVals.push(sanitize(service_area)) }
      if (description)      { vUpdates.push('description = ?');      vVals.push(sanitize(description)) }
      if (experience_years) { vUpdates.push('experience_years = ?'); vVals.push(parseInt(experience_years)) }
      if (certifications)   { vUpdates.push('certifications = ?');   vVals.push(sanitize(certifications)) }
      if (services_offered) { vUpdates.push('services_offered = ?'); vVals.push(sanitize(services_offered)) }
      if (logo_url)         { vUpdates.push('logo_url = ?');         vVals.push(logo_url) }
      if (website)          { vUpdates.push('website = ?');          vVals.push(website) }
      if (portfolio_images) { vUpdates.push('portfolio_images = ?'); vVals.push(JSON.stringify(portfolio_images)) }
      if (specializations)  { vUpdates.push('specializations = ?');  vVals.push(sanitize(specializations)) }
      if (vUpdates.length > 0) {
        vVals.push(user.id)
        await c.env.DB.prepare(`UPDATE vendor_profiles SET ${vUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).bind(...vVals).run()
      }
    }

    // Update expert profile
    if (user.role === 'expert') {
      const eUpdates: string[] = [], eVals: any[] = []
      if (certification)  { eUpdates.push('certification = ?');   eVals.push(sanitize(certification)) }
      if (expertise_area) { eUpdates.push('expertise_area = ?');  eVals.push(sanitize(expertise_area)) }
      if (service_area)   { eUpdates.push('service_area = ?');    eVals.push(sanitize(service_area)) }
      if (description)    { eUpdates.push('bio = ?');             eVals.push(sanitize(description)) }
      if (eUpdates.length > 0) {
        eVals.push(user.id)
        await c.env.DB.prepare(`UPDATE expert_profiles SET ${eUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).bind(...eVals).run()
      }
    }

    return c.json({ message: 'Profile updated successfully' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/users/change-password - Change password
users.post('/change-password', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { current_password, new_password } = await c.req.json()
    if (!current_password || !new_password) return c.json({ error: 'Both passwords required' }, 400)
    if (new_password.length < 6) return c.json({ error: 'New password must be at least 6 characters' }, 400)

    // Verify current password
    const { hashPassword, verifyPassword } = await import('../lib/auth')
    const dbUser = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first() as any
    if (!dbUser || !(await verifyPassword(current_password, dbUser.password_hash))) {
      return c.json({ error: 'Current password is incorrect' }, 401)
    }
    const newHash = await hashPassword(new_password)
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run()
    return c.json({ message: 'Password changed successfully' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/users/forgot-password - Request password reset
users.post('/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json()
    if (!email) return c.json({ error: 'Email required' }, 400)
    const u = await c.env.DB.prepare('SELECT id, name, email FROM users WHERE email = ?').bind(email.toLowerCase()).first() as any
    if (!u) return c.json({ message: 'If this email exists, a reset link has been sent.' }) // Security: don't reveal

    const token = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
    const expiry = new Date(Date.now() + 3600000).toISOString() // 1 hour
    await c.env.DB.prepare(
      "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?"
    ).bind(token, expiry, u.id).run()

    await sendEmailNotification(c.env, {
      to: u.email,
      subject: 'Reset your BidKarts password',
      template: 'password_reset',
      data: { name: u.name, token, userId: u.id }
    })
    return c.json({ message: 'If this email exists, a reset link has been sent.' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/users/reset-password - Complete password reset
users.post('/reset-password', async (c) => {
  try {
    const { token, new_password } = await c.req.json()
    if (!token || !new_password) return c.json({ error: 'Token and new password required' }, 400)
    if (new_password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

    const u = await c.env.DB.prepare(
      "SELECT id, name, email FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()"
    ).bind(token).first() as any
    if (!u) return c.json({ error: 'Invalid or expired reset token' }, 400)

    const { hashPassword } = await import('../lib/auth')
    const hash = await hashPassword(new_password)
    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?'
    ).bind(hash, u.id).run()
    return c.json({ message: 'Password reset successfully. You can now log in.' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/users/notifications - Get notifications
users.get('/notifications', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const result = await c.env.DB.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30'
    ).bind(user.id).all()
    return c.json({ notifications: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/users/notifications/read - Mark all read
users.patch('/notifications/read', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(user.id).run()
    return c.json({ message: 'Notifications marked as read' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/users/review - Submit review
users.post('/review', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const { project_id, vendor_id, rating, comment } = await c.req.json()
    if (!project_id || !vendor_id || !rating) return c.json({ error: 'Missing required fields' }, 400)
    if (rating < 1 || rating > 5) return c.json({ error: 'Rating must be 1-5' }, 400)

    // Check project ownership and completion
    const project = await c.env.DB.prepare(
      "SELECT * FROM projects WHERE id = ? AND customer_id = ? AND status IN ('completed','in_progress','vendor_selected')"
    ).bind(project_id, user.id).first()
    if (!project) return c.json({ error: 'You can only review vendors on your own projects' }, 403)

    // Check duplicate
    const dup = await c.env.DB.prepare('SELECT id FROM reviews WHERE project_id = ? AND reviewer_id = ?').bind(project_id, user.id).first()
    if (dup) return c.json({ error: 'You already reviewed this project' }, 409)

    await c.env.DB.prepare(
      'INSERT INTO reviews (project_id, reviewer_id, vendor_id, rating, comment) VALUES (?, ?, ?, ?, ?)'
    ).bind(project_id, user.id, vendor_id, rating, sanitize(comment || '')).run()

    // Update vendor avg rating
    const avgResult = await c.env.DB.prepare(
      'SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE vendor_id = ?'
    ).bind(vendor_id).first() as any
    await c.env.DB.prepare(
      'UPDATE vendor_profiles SET rating = ?, total_reviews = ? WHERE user_id = ?'
    ).bind(Math.round((avgResult?.avg || 0) * 10) / 10, avgResult?.cnt || 0, vendor_id).run()

    await createNotification(c.env.DB, vendor_id, '⭐ New Review Received', `You received a ${rating}-star review!`, 'review', parseInt(project_id), 'project')
    return c.json({ message: 'Review submitted successfully' }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/users/referral - Apply referral code
users.post('/referral', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { referral_code } = await c.req.json()
    if (!referral_code) return c.json({ error: 'Referral code required' }, 400)

    const referrer = await c.env.DB.prepare(
      "SELECT id, name FROM users WHERE referral_code = ? AND id != ?"
    ).bind(referral_code.toUpperCase(), user.id).first() as any
    if (!referrer) return c.json({ error: 'Invalid referral code' }, 404)

    // Check if already used
    const used = await c.env.DB.prepare('SELECT id FROM referrals WHERE referred_id = ?').bind(user.id).first()
    if (used) return c.json({ error: 'You have already used a referral code' }, 409)

    await c.env.DB.prepare(
      'INSERT INTO referrals (referrer_id, referred_id, status) VALUES (?, ?, ?)'
    ).bind(referrer.id, user.id, 'applied').run()

    await createNotification(c.env.DB, referrer.id, '🎉 Referral Bonus!', `${user.name} joined using your referral code!`, 'referral', user.id, 'user')
    return c.json({ message: `Referral applied! You were referred by ${referrer.name}.` })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/users/referral-stats - Referral stats
users.get('/referral-stats', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const referralCode = await c.env.DB.prepare('SELECT referral_code FROM users WHERE id = ?').bind(user.id).first() as any
    const stats = await c.env.DB.prepare(
      'SELECT COUNT(*) as total_referrals FROM referrals WHERE referrer_id = ?'
    ).bind(user.id).first() as any
    return c.json({ referral_code: referralCode?.referral_code, total_referrals: stats?.total_referrals || 0 })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/users/experts - Browse all approved experts
users.get('/experts', async (c) => {
  try {
    const { service_type, location, page = '1' } = c.req.query()
    const limit = 12, offset = (parseInt(page) - 1) * limit
    let query = `SELECT u.id, u.name, u.email, u.avatar_url, u.phone,
      ep.specialization, ep.certification, ep.experience, ep.service_area,
      ep.rating, ep.total_inspections as total_consultations, ep.bio,
      ep.expertise_area, ep.hourly_rate, ep.is_available, ep.is_approved
      FROM users u JOIN expert_profiles ep ON ep.user_id = u.id
      WHERE u.is_active = 1 AND ep.is_approved = 1`
    const params: any[] = []
    if (service_type) { query += ' AND (ep.expertise_area LIKE ? OR ep.specialization LIKE ?)'; params.push(`%${service_type}%`, `%${service_type}%`) }
    if (location) { query += ' AND ep.service_area LIKE ?'; params.push(`%${location}%`) }
    query += ' ORDER BY ep.rating DESC, ep.total_inspections DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ experts: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// GET /api/users/experts/:id - Expert detail
users.get('/experts/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const expert = await c.env.DB.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.created_at,
        ep.specialization, ep.certification, ep.experience, ep.service_area,
        ep.rating, ep.total_inspections, ep.bio, ep.expertise_area, ep.hourly_rate, ep.is_available
      FROM users u JOIN expert_profiles ep ON ep.user_id = u.id
      WHERE u.id = ? AND u.is_active = 1`).bind(id).first()
    if (!expert) return c.json({ error: 'Expert not found' }, 404)
    const reviews = await c.env.DB.prepare(`
      SELECT con.rating, con.review, con.topic, cu.name as customer_name, con.completed_at
      FROM consultations con JOIN users cu ON con.customer_id = cu.id
      WHERE con.expert_id = ? AND con.rating IS NOT NULL ORDER BY con.completed_at DESC LIMIT 10`).bind(id).all()
    return c.json({ expert, reviews: reviews.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// POST /api/users/subscribe - Upgrade subscription (vendor)
users.post('/subscribe', authMiddleware, requireRole('vendor'), async (c) => {
  try {
    const user = c.get('user')
    const { plan } = await c.req.json()
    if (!['free', 'pro', 'premium'].includes(plan)) return c.json({ error: 'Invalid plan' }, 400)
    await c.env.DB.prepare('UPDATE vendor_profiles SET subscription_plan = ? WHERE user_id = ?').bind(plan, user.id).run()
    await c.env.DB.prepare('UPDATE users SET subscription_plan = ? WHERE id = ?').bind(plan, user.id).run()
    await createNotification(c.env.DB, user.id, '🎉 Subscription Updated',
      `Your plan has been upgraded to ${plan.toUpperCase()}. Enjoy the new features!`, 'success')
    return c.json({ message: `Subscribed to ${plan} plan`, plan })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// GET /api/users/subscription - Get vendor bid count & plan limits
users.get('/subscription', authMiddleware, requireRole('vendor'), async (c) => {
  try {
    const user = c.get('user')
    const profile = await c.env.DB.prepare(
      'SELECT subscription_plan FROM vendor_profiles WHERE user_id = ?'
    ).bind(user.id).first() as any
    const plan = profile?.subscription_plan || 'free'
    const limits = { free: 5, pro: -1, premium: -1 }
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
    const bidCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM bids b JOIN projects p ON b.project_id=p.id WHERE b.vendor_id=? AND b.created_at >= ?"
    ).bind(user.id, monthStart.toISOString()).first<{cnt:number}>()
    const bidsUsed = bidCount?.cnt || 0
    const limit = limits[plan as keyof typeof limits]
    return c.json({ plan, bids_used: bidsUsed, bid_limit: limit, bids_remaining: limit === -1 ? 'unlimited' : Math.max(0, limit - bidsUsed) })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// GET /api/users/shortlist - Get customer shortlisted vendors
users.get('/shortlist', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const result = await c.env.DB.prepare(`
      SELECT vs.*, u.name, u.email, u.avatar_url,
        vp.company_name, vp.rating, vp.specializations, vp.service_area, vp.subscription_plan
      FROM vendor_shortlist vs JOIN users u ON vs.vendor_id=u.id
      LEFT JOIN vendor_profiles vp ON vp.user_id=u.id
      WHERE vs.customer_id=? ORDER BY vs.created_at DESC`).bind(user.id).all()
    return c.json({ shortlist: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

export default users
