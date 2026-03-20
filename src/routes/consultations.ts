// src/routes/consultations.ts - Expert Consultation & Request Management (v5)
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const consultations = new Hono<{ Bindings: Env; Variables: Variables }>()

// ── Browse Experts (public) ───────────────────────────────────────────────────
consultations.get('/experts', async (c) => {
  try {
    const { service_type, location, page = '1' } = c.req.query()
    const limit = 12, offset = (parseInt(page) - 1) * limit
    let query = `SELECT u.id, u.name, u.email, u.avatar_url, u.phone,
      ep.id as profile_id, ep.specialization, ep.certification, ep.experience,
      ep.service_area, ep.rating, ep.total_inspections as total_consultations,
      ep.bio, ep.expertise_area, ep.hourly_rate, ep.is_available, ep.is_approved
      FROM users u
      JOIN expert_profiles ep ON ep.user_id = u.id
      WHERE u.is_active = 1 AND ep.is_approved = 1`
    const params: any[] = []
    if (service_type) { query += ' AND (ep.expertise_area LIKE ? OR ep.specialization LIKE ?)'; params.push(`%${service_type}%`, `%${service_type}%`) }
    if (location) { query += ' AND ep.service_area LIKE ?'; params.push(`%${location}%`) }
    query += ' ORDER BY ep.rating DESC, ep.total_inspections DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const result = await c.env.DB.prepare(query).bind(...params).all()
    const total = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM expert_profiles ep JOIN users u ON ep.user_id=u.id WHERE u.is_active=1 AND ep.is_approved=1`).first<{cnt:number}>()
    return c.json({ experts: result.results, total: total?.cnt || 0 })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Get a single expert profile ───────────────────────────────────────────────
consultations.get('/experts/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const expert = await c.env.DB.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_url, u.phone, u.created_at,
        ep.specialization, ep.certification, ep.experience, ep.service_area,
        ep.rating, ep.total_inspections, ep.bio, ep.expertise_area, ep.hourly_rate, ep.is_available
      FROM users u JOIN expert_profiles ep ON ep.user_id = u.id
      WHERE u.id = ? AND u.is_active = 1`).bind(id).first()
    if (!expert) return c.json({ error: 'Expert not found' }, 404)
    const recentReviews = await c.env.DB.prepare(`
      SELECT con.rating, con.review, con.topic, cu.name as customer_name, con.created_at
      FROM consultations con JOIN users cu ON con.customer_id = cu.id
      WHERE con.expert_id = ? AND con.rating IS NOT NULL
      ORDER BY con.created_at DESC LIMIT 10`).bind(id).all()
    return c.json({ expert, reviews: recentReviews.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Availability Slots ────────────────────────────────────────────────────────
consultations.get('/slots/:expertId', async (c) => {
  try {
    const expertId = c.req.param('expertId')
    const result = await c.env.DB.prepare(
      `SELECT * FROM consultation_slots WHERE expert_id = ? AND slot_date >= date('now') AND is_booked = 0 ORDER BY slot_date, slot_time LIMIT 20`
    ).bind(expertId).all()
    const slots = result.results.length > 0 ? result.results : generateDefaultSlots(parseInt(expertId))
    return c.json({ slots })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

function generateDefaultSlots(expertId: number) {
  const slots = []
  const times = ['09:00', '10:30', '12:00', '14:00', '15:30', '17:00']
  for (let day = 1; day <= 7; day++) {
    const date = new Date(); date.setDate(date.getDate() + day)
    if (date.getDay() === 0) continue
    const dateStr = date.toISOString().split('T')[0]
    for (const time of times.slice(0, 4)) {
      slots.push({ expert_id: expertId, slot_date: dateStr, slot_time: time, duration_mins: 60, is_booked: false, id: `${expertId}_${dateStr}_${time}` })
    }
  }
  return slots
}

// ── List consultations (role-filtered) ───────────────────────────────────────
consultations.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { status } = c.req.query()
    let query = '', params: any[] = []

    if (user.role === 'customer') {
      query = `SELECT con.*, u.name as expert_name, u.email as expert_email, u.avatar_url as expert_avatar,
        ep.specialization, ep.certification, ep.rating as expert_rating, ep.experience, ep.hourly_rate
        FROM consultations con
        JOIN users u ON con.expert_id = u.id
        LEFT JOIN expert_profiles ep ON ep.user_id = con.expert_id
        WHERE con.customer_id = ?`
      params = [user.id]
    } else if (user.role === 'expert') {
      query = `SELECT con.*,
        cu.name as customer_name, cu.email as customer_email, cu.phone as customer_phone, cu.avatar_url as customer_avatar,
        p.title as project_title, p.service_type as project_service_type, p.location as project_location
        FROM consultations con
        JOIN users cu ON con.customer_id = cu.id
        LEFT JOIN projects p ON con.project_id = p.id
        WHERE con.expert_id = ?`
      params = [user.id]
    } else if (user.role === 'admin') {
      query = `SELECT con.*, cu.name as customer_name, ex.name as expert_name, ep.specialization
        FROM consultations con
        JOIN users cu ON con.customer_id = cu.id
        JOIN users ex ON con.expert_id = ex.id
        LEFT JOIN expert_profiles ep ON ep.user_id = con.expert_id
        ORDER BY con.created_at DESC LIMIT 100`
    }

    if (status && query) {
      query += query.includes('WHERE') ? ' AND con.status = ?' : ' WHERE con.status = ?'
      params.push(status)
    }
    if (query) query += ' ORDER BY con.created_at DESC'

    const result = await c.env.DB.prepare(query).bind(...params).all()

    if (user.role === 'expert') {
      const all = result.results as any[]
      return c.json({
        consultations: all,
        pending: all.filter(c => c.status === 'requested'),
        accepted: all.filter(c => ['accepted','scheduled'].includes(c.status)),
        completed: all.filter(c => c.status === 'completed'),
        total_pending: all.filter(c => c.status === 'requested').length
      })
    }
    return c.json({ consultations: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Book a consultation (Customer selects expert OR auto-assign nearby) ───────
consultations.post('/', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const { expert_id, service_type, topic, description, preferred_date, preferred_time,
            consultation_type, project_id, attachments, location } = await c.req.json()

    if (!service_type || !topic) return c.json({ error: 'service_type and topic required' }, 400)

    let assignedExpertId = expert_id ? parseInt(expert_id) : null
    let expert: any = null

    // If no expert selected, auto-assign a random nearby/available expert
    if (!assignedExpertId) {
      // Try to match by location from project or user location
      let locationFilter = location || ''
      if (!locationFilter && project_id) {
        const proj = await c.env.DB.prepare('SELECT location FROM projects WHERE id = ?').bind(project_id).first() as any
        locationFilter = proj?.location || ''
      }

      // Find available experts, prefer location match
      let expertQuery = `SELECT u.id, u.name, u.email, ep.hourly_rate, ep.is_approved, ep.is_available, ep.service_area
        FROM users u JOIN expert_profiles ep ON ep.user_id = u.id
        WHERE u.is_active = 1 AND ep.is_approved = 1 AND ep.is_available = 1`
      const expertParams: any[] = []

      if (service_type) {
        expertQuery += ` AND (ep.expertise_area LIKE ? OR ep.specialization LIKE ?)`
        expertParams.push(`%${service_type}%`, `%${service_type}%`)
      }
      expertQuery += ` ORDER BY ep.rating DESC, ep.total_inspections DESC LIMIT 20`

      const expertList = await c.env.DB.prepare(expertQuery).bind(...expertParams).all()
      const availableExperts = expertList.results as any[]

      if (availableExperts.length === 0) {
        // Fall back to any approved expert
        const fallback = await c.env.DB.prepare(`SELECT u.id, u.name, u.email, ep.hourly_rate FROM users u JOIN expert_profiles ep ON ep.user_id = u.id WHERE u.is_active=1 AND ep.is_approved=1 LIMIT 10`).all()
        const fallbackList = fallback.results as any[]
        if (fallbackList.length === 0) {
          // No expert available - create unassigned consultation for admin to assign
          const fee = 1500
          const result = await c.env.DB.prepare(`
            INSERT INTO consultations (customer_id, expert_id, project_id, service_type, topic, description,
              preferred_date, preferred_time, consultation_type, fee, status, customer_notes)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_assignment', ?)`
          ).bind(user.id, project_id || null, service_type, topic, description || '',
              preferred_date || null, preferred_time || null, consultation_type || 'video', fee,
              attachments ? JSON.stringify(attachments) : null).run()

          // Notify admin to assign expert
          const admins = await c.env.DB.prepare(`SELECT id FROM users WHERE role='admin' LIMIT 5`).all()
          for (const admin of admins.results as any[]) {
            await createNotification(c.env.DB, admin.id, '🔔 Expert Assignment Needed',
              `Customer ${user.name} requested expert consultation but no expert available. Please assign manually.`,
              'consultation', result.meta.last_row_id as number, 'consultation')
          }

          return c.json({
            message: 'Consultation request submitted. Admin will assign an expert shortly.',
            consultation_id: result.meta.last_row_id,
            fee,
            expert_name: 'Pending Assignment',
            next_step: 'Admin will assign an expert within 24 hours',
            auto_assigned: false
          }, 201)
        }
        expert = fallbackList[Math.floor(Math.random() * fallbackList.length)]
      } else {
        // Prefer experts from same location, else pick random
        const locationMatched = locationFilter
          ? availableExperts.filter(e => e.service_area?.toLowerCase().includes(locationFilter.toLowerCase().split(',')[0]))
          : []
        const pool = locationMatched.length > 0 ? locationMatched : availableExperts
        expert = pool[Math.floor(Math.random() * pool.length)]
      }
      assignedExpertId = expert.id
    } else {
      // Expert explicitly selected - verify
      expert = await c.env.DB.prepare(`
        SELECT u.id, u.name, u.email, ep.hourly_rate, ep.is_approved, ep.is_available
        FROM users u JOIN expert_profiles ep ON ep.user_id = u.id
        WHERE u.id = ? AND u.is_active = 1 AND ep.is_approved = 1`).bind(assignedExpertId).first() as any
      if (!expert) return c.json({ error: 'Expert not found or not available' }, 404)
    }

    // ── DUPLICATE CHECK: same customer + same expert + pending/accepted ──────
    const duplicate = await c.env.DB.prepare(`
      SELECT id FROM consultations
      WHERE customer_id = ? AND expert_id = ? AND status NOT IN ('completed','cancelled')
      LIMIT 1`).bind(user.id, assignedExpertId).first() as any

    if (duplicate) {
      return c.json({
        error: 'You already have an active consultation request with this expert. Please wait for it to be completed or cancelled before creating a new one.',
        existing_consultation_id: duplicate.id
      }, 409)
    }

    const fee = expert?.hourly_rate || 1500
    const result = await c.env.DB.prepare(`
      INSERT INTO consultations (customer_id, expert_id, project_id, service_type, topic, description,
        preferred_date, preferred_time, consultation_type, fee, status, customer_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?)`
    ).bind(user.id, assignedExpertId, project_id || null, service_type, topic, description || '',
        preferred_date || null, preferred_time || null, consultation_type || 'video', fee,
        attachments ? JSON.stringify(attachments) : null).run()

    const consultationId = result.meta.last_row_id

    // Notify expert
    await createNotification(c.env.DB, assignedExpertId,
      '🔔 New Consultation Request!',
      `${user.name} has requested a ${consultation_type || 'video'} consultation on "${topic}". Fee: ₹${fee}. Please respond within 24 hours.`,
      'consultation', consultationId as number, 'consultation')

    return c.json({
      message: expert_id ? 'Consultation request sent successfully!' : `Consultation request sent! Expert ${expert?.name || ''} has been auto-assigned.`,
      consultation_id: consultationId,
      fee,
      expert_name: expert?.name || 'Expert',
      expert_id: assignedExpertId,
      auto_assigned: !expert_id,
      next_step: 'Expert will confirm within 24 hours'
    }, 201)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Admin: Assign expert to pending consultation ──────────────────────────────
consultations.patch('/:id/assign', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id')
    const { expert_id } = await c.req.json()
    if (!expert_id) return c.json({ error: 'expert_id required' }, 400)

    const con = await c.env.DB.prepare('SELECT * FROM consultations WHERE id = ?').bind(id).first() as any
    if (!con) return c.json({ error: 'Consultation not found' }, 404)

    // Check for duplicate
    const dup = await c.env.DB.prepare(`SELECT id FROM consultations WHERE customer_id=? AND expert_id=? AND status NOT IN ('completed','cancelled') AND id != ?`).bind(con.customer_id, expert_id, id).first()
    if (dup) return c.json({ error: 'Customer already has active consultation with this expert' }, 409)

    await c.env.DB.prepare(`UPDATE consultations SET expert_id=?, status='requested', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(expert_id, id).run()
    const expert = await c.env.DB.prepare('SELECT name FROM users WHERE id=?').bind(expert_id).first() as any

    await createNotification(c.env.DB, expert_id, '🔔 New Consultation Request Assigned!',
      `Admin has assigned you a consultation request from ${con.customer_name || 'a customer'} on "${con.topic}".`,
      'consultation', parseInt(id), 'consultation')
    await createNotification(c.env.DB, con.customer_id, '✅ Expert Assigned!',
      `${expert?.name || 'An expert'} has been assigned to your consultation request.`,
      'consultation', parseInt(id), 'consultation')

    return c.json({ message: 'Expert assigned successfully' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Expert: Accept request ─────────────────────────────────────────────────────
consultations.patch('/:id/accept', authMiddleware, requireRole('expert'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { scheduled_date, scheduled_time, video_link, notes } = await c.req.json()
    const con = await c.env.DB.prepare('SELECT * FROM consultations WHERE id = ?').bind(id).first() as any
    if (!con) return c.json({ error: 'Consultation not found' }, 404)
    if (con.expert_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    await c.env.DB.prepare(`UPDATE consultations SET status='accepted', scheduled_date=?, scheduled_time=?, video_link=?, expert_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(scheduled_date || con.preferred_date, scheduled_time || con.preferred_time, video_link || null, notes || null, id).run()
    await createNotification(c.env.DB, con.customer_id, '✅ Consultation Accepted!',
      `${user.name} has accepted your consultation request. Scheduled: ${scheduled_date || con.preferred_date} at ${scheduled_time || con.preferred_time}`,
      'success', parseInt(id), 'consultation')
    return c.json({ message: 'Consultation accepted and scheduled' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Expert: Reject request ────────────────────────────────────────────────────
consultations.patch('/:id/reject', authMiddleware, requireRole('expert'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { reason } = await c.req.json()
    const con = await c.env.DB.prepare('SELECT * FROM consultations WHERE id = ?').bind(id).first() as any
    if (!con) return c.json({ error: 'Consultation not found' }, 404)
    if (con.expert_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    await c.env.DB.prepare(`UPDATE consultations SET status='cancelled', expert_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(reason || 'Expert unavailable', id).run()
    await createNotification(c.env.DB, con.customer_id, '❌ Consultation Request Declined',
      `${user.name} has declined your consultation request. ${reason ? 'Reason: ' + reason : 'Please try booking another expert.'}`,
      'warning', parseInt(id), 'consultation')
    return c.json({ message: 'Consultation rejected' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Expert: Complete ──────────────────────────────────────────────────────────
consultations.patch('/:id/complete', authMiddleware, requireRole('expert'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { report_url, recommendations, summary } = await c.req.json()
    const con = await c.env.DB.prepare('SELECT * FROM consultations WHERE id = ?').bind(id).first() as any
    if (!con) return c.json({ error: 'Consultation not found' }, 404)
    if (con.expert_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    await c.env.DB.prepare(`UPDATE consultations SET status='completed', report_url=?, recommendations=?, summary=?, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(report_url || null, recommendations || null, summary || null, id).run()
    await c.env.DB.prepare(`UPDATE expert_profiles SET total_inspections = total_inspections + 1 WHERE user_id = ?`).bind(user.id).run()
    await createNotification(c.env.DB, con.customer_id, '📋 Consultation Report Ready',
      `Your consultation with ${user.name} is completed. ${recommendations ? 'Key recommendations: ' + recommendations.substring(0, 80) + '...' : 'Report is now available in your dashboard.'}`,
      'success', parseInt(id), 'consultation')
    return c.json({ message: 'Consultation completed' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Customer: Rate consultation ───────────────────────────────────────────────
consultations.patch('/:id/rate', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { rating, review } = await c.req.json()
    if (!rating || rating < 1 || rating > 5) return c.json({ error: 'Rating must be 1-5' }, 400)
    const con = await c.env.DB.prepare('SELECT * FROM consultations WHERE id = ?').bind(id).first() as any
    if (!con || con.customer_id !== user.id) return c.json({ error: 'Not found or unauthorized' }, 404)
    await c.env.DB.prepare('UPDATE consultations SET rating=?, review=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(rating, review || null, id).run()
    const avgResult = await c.env.DB.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM consultations WHERE expert_id=? AND rating IS NOT NULL').bind(con.expert_id).first() as any
    if (avgResult) {
      await c.env.DB.prepare('UPDATE expert_profiles SET rating=? WHERE user_id=?').bind(parseFloat((avgResult.avg_rating || 0).toFixed(1)), con.expert_id).run()
    }
    return c.json({ message: 'Rating submitted' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Expert: Earnings ──────────────────────────────────────────────────────────
consultations.get('/earnings', authMiddleware, requireRole('expert'), async (c) => {
  try {
    const user = c.get('user')
    const result = await c.env.DB.prepare(`
      SELECT COUNT(*) as total_consultations,
        COUNT(CASE WHEN status='completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status='requested' THEN 1 END) as pending_requests,
        COUNT(CASE WHEN status='accepted' THEN 1 END) as accepted,
        SUM(CASE WHEN status='completed' THEN fee ELSE 0 END) as gross_earnings,
        SUM(CASE WHEN status='completed' THEN fee*0.85 ELSE 0 END) as net_earnings,
        AVG(CASE WHEN status='completed' THEN fee END) as avg_fee,
        AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating
      FROM consultations WHERE expert_id = ?`).bind(user.id).first()
    const recent = await c.env.DB.prepare(`
      SELECT con.*, cu.name as customer_name, cu.avatar_url as customer_avatar
      FROM consultations con JOIN users cu ON con.customer_id = cu.id
      WHERE con.expert_id = ? ORDER BY con.created_at DESC LIMIT 10`).bind(user.id).all()
    return c.json({ earnings: result, recent_consultations: recent.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Expert: Add availability slot ─────────────────────────────────────────────
consultations.post('/slots', authMiddleware, requireRole('expert'), async (c) => {
  try {
    const user = c.get('user')
    const { slot_date, slot_time, duration_mins } = await c.req.json()
    if (!slot_date || !slot_time) return c.json({ error: 'slot_date and slot_time required' }, 400)
    const result = await c.env.DB.prepare(
      'INSERT INTO consultation_slots (expert_id, slot_date, slot_time, duration_mins) VALUES (?, ?, ?, ?)'
    ).bind(user.id, slot_date, slot_time, duration_mins || 60).run()
    return c.json({ message: 'Slot added', id: result.meta.last_row_id }, 201)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

export default consultations
