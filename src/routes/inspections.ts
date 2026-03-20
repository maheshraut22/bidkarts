// src/routes/inspections.ts - Technical Inspection routes
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const inspections = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/inspections/my - Get inspections for logged user
inspections.get('/my', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    let query = '', params: any[] = []

    if (user.role === 'customer') {
      query = `SELECT i.*, p.title as project_title, p.service_type,
        u.name as expert_name, u.phone as expert_phone
        FROM inspections i
        JOIN projects p ON i.project_id = p.id
        LEFT JOIN users u ON i.expert_id = u.id
        WHERE i.customer_id = ? ORDER BY i.created_at DESC`
      params = [user.id]
    } else if (user.role === 'expert') {
      query = `SELECT i.*, p.title as project_title, p.service_type, p.location,
        u.name as customer_name, u.phone as customer_phone
        FROM inspections i
        JOIN projects p ON i.project_id = p.id
        JOIN users u ON i.customer_id = u.id
        WHERE i.expert_id = ? ORDER BY i.created_at DESC`
      params = [user.id]
    } else if (user.role === 'admin') {
      query = `SELECT i.*, p.title as project_title, 
        c.name as customer_name, e.name as expert_name
        FROM inspections i
        JOIN projects p ON i.project_id = p.id
        JOIN users c ON i.customer_id = c.id
        LEFT JOIN users e ON i.expert_id = e.id
        ORDER BY i.created_at DESC`
    }

    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ inspections: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/inspections - Request inspection
inspections.post('/', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const { project_id } = await c.req.json()
    if (!project_id) return c.json({ error: 'Project ID required' }, 400)

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND customer_id = ?').bind(project_id, user.id).first()
    if (!project) return c.json({ error: 'Project not found' }, 404)

    const existing = await c.env.DB.prepare(
      "SELECT id FROM inspections WHERE project_id = ? AND status NOT IN ('cancelled')"
    ).bind(project_id).first()
    if (existing) return c.json({ error: 'Inspection already requested for this project' }, 409)

    const result = await c.env.DB.prepare(
      'INSERT INTO inspections (project_id, customer_id, status, fee) VALUES (?, ?, ?, ?)'
    ).bind(project_id, user.id, 'requested', 1500).run()

    // Notify admins to assign expert
    await createNotification(c.env.DB, user.id, '🔍 Inspection Requested', 'Your inspection request has been submitted. Please complete payment to proceed.', 'inspection', result.meta.last_row_id as number, 'inspection')

    return c.json({
      inspection: { id: result.meta.last_row_id, project_id, status: 'requested', fee: 1500 },
      message: 'Inspection requested. Please proceed to payment.'
    }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/inspections/:id/assign - Assign expert (admin)
inspections.patch('/:id/assign', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id')
    const { expert_id, visit_date } = await c.req.json()

    const inspection = await c.env.DB.prepare('SELECT * FROM inspections WHERE id = ?').bind(id).first() as any
    if (!inspection) return c.json({ error: 'Not found' }, 404)

    await c.env.DB.prepare(
      "UPDATE inspections SET expert_id = ?, visit_date = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(expert_id, visit_date || null, id).run()

    // Notify expert and customer
    await createNotification(c.env.DB, expert_id, '📋 New Inspection Assigned', 'You have been assigned a technical inspection.', 'inspection', parseInt(id), 'inspection')
    await createNotification(c.env.DB, inspection.customer_id, '✅ Expert Assigned', 'An expert has been assigned to your inspection request.', 'inspection', parseInt(id), 'inspection')

    return c.json({ message: 'Expert assigned' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/inspections/:id/report - Expert uploads report
inspections.patch('/:id/report', authMiddleware, requireRole('expert', 'admin'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { recommendation, report_url } = await c.req.json()

    // Admin can update any inspection; expert can only update their own
    let query = 'SELECT * FROM inspections WHERE id = ?'
    let params: any[] = [id]
    if (user.role === 'expert') {
      query += ' AND expert_id = ?'
      params.push(user.id)
    }

    const inspection = await c.env.DB.prepare(query).bind(...params).first() as any
    if (!inspection) return c.json({ error: 'Inspection not found' }, 404)

    const newStatus = recommendation ? 'completed' : inspection.status

    await c.env.DB.prepare(
      "UPDATE inspections SET recommendation = ?, report_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(recommendation || inspection.recommendation, report_url || null, newStatus, id).run()

    if (newStatus === 'completed') {
      await createNotification(c.env.DB, inspection.customer_id, '📄 Inspection Report Ready', 'Your technical inspection report is now available.', 'inspection', parseInt(id), 'inspection')
    }

    return c.json({ message: 'Inspection report submitted' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/inspections/:id/cancel - Admin cancels inspection
inspections.patch('/:id/cancel', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id')
    const inspection = await c.env.DB.prepare('SELECT * FROM inspections WHERE id = ?').bind(id).first() as any
    if (!inspection) return c.json({ error: 'Inspection not found' }, 404)
    await c.env.DB.prepare("UPDATE inspections SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run()
    await createNotification(c.env.DB, inspection.customer_id, '❌ Inspection Cancelled', 'Your inspection request has been cancelled by admin.', 'inspection', parseInt(id), 'inspection')
    return c.json({ message: 'Inspection cancelled' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

export default inspections
