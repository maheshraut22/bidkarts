// src/routes/disputes.ts - Dispute Resolution System
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const disputes = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/disputes - List disputes
disputes.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    let query = '', params: any[] = []
    if (user.role === 'admin') {
      query = `SELECT d.*, p.title as project_title,
        cu.name as customer_name, cu.email as customer_email,
        ve.name as vendor_name, ve.email as vendor_email
        FROM disputes d
        JOIN projects p ON d.project_id = p.id
        JOIN users cu ON d.customer_id = cu.id
        JOIN users ve ON d.vendor_id = ve.id
        ORDER BY d.created_at DESC LIMIT 50`
    } else if (user.role === 'customer') {
      query = `SELECT d.*, p.title as project_title, ve.name as vendor_name
        FROM disputes d
        JOIN projects p ON d.project_id = p.id
        JOIN users ve ON d.vendor_id = ve.id
        WHERE d.customer_id = ? ORDER BY d.created_at DESC`
      params = [user.id]
    } else if (user.role === 'vendor') {
      query = `SELECT d.*, p.title as project_title, cu.name as customer_name
        FROM disputes d
        JOIN projects p ON d.project_id = p.id
        JOIN users cu ON d.customer_id = cu.id
        WHERE d.vendor_id = ? ORDER BY d.created_at DESC`
      params = [user.id]
    }
    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ disputes: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/disputes - Raise a dispute
disputes.post('/', authMiddleware, requireRole('customer', 'vendor'), async (c) => {
  try {
    const user = c.get('user')
    const { project_id, reason, description, evidence_urls } = await c.req.json()
    if (!project_id || !reason || !description) return c.json({ error: 'project_id, reason, description required' }, 400)
    
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    
    // Verify user is involved in the project
    const isCustomer = project.customer_id === user.id
    const isVendor = project.selected_vendor_id === user.id || project.vendor_id === user.id
    if (!isCustomer && !isVendor) return c.json({ error: 'You are not involved in this project' }, 403)

    // Check existing open dispute
    const existing = await c.env.DB.prepare(`SELECT id FROM disputes WHERE project_id = ? AND status NOT IN ('resolved','closed')`).bind(project_id).first()
    if (existing) return c.json({ error: 'An active dispute already exists for this project' }, 400)

    const customer_id = isCustomer ? user.id : project.customer_id
    const vendor_id = isVendor ? user.id : (project.selected_vendor_id || project.vendor_id)

    const result = await c.env.DB.prepare(`
      INSERT INTO disputes (project_id, customer_id, vendor_id, raised_by, reason, description, evidence_urls, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
    `).bind(project_id, customer_id, vendor_id, user.id, reason, description, evidence_urls ? JSON.stringify(evidence_urls) : null).run()
    
    const disputeId = result.meta.last_row_id
    // Notify admin
    const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 3").all()
    for (const admin of (admins.results as any[])) {
      await createNotification(c.env.DB, admin.id, 'New Dispute Raised', 
        `Dispute raised for project: ${project.title}. Reason: ${reason}`, 'dispute', disputeId)
    }
    // Notify the other party
    const otherId = isCustomer ? vendor_id : customer_id
    if (otherId) {
      await createNotification(c.env.DB, otherId, 'Dispute Filed Against Project', 
        `A dispute has been raised for project: ${project.title}`, 'dispute', disputeId)
    }
    return c.json({ message: 'Dispute raised successfully. Admin will review within 48 hours.', dispute_id: disputeId }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/disputes/:id/respond - Respond to a dispute
disputes.patch('/:id/respond', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { response, evidence_urls } = await c.req.json()
    const dispute = await c.env.DB.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first() as any
    if (!dispute) return c.json({ error: 'Dispute not found' }, 404)
    if (dispute.customer_id !== user.id && dispute.vendor_id !== user.id && user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403)
    }
    const field = user.id === dispute.customer_id ? 'customer_response' : 'vendor_response'
    await c.env.DB.prepare(`UPDATE disputes SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(response, id).run()
    
    // Notify admin
    const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 2").all()
    for (const admin of (admins.results as any[])) {
      await createNotification(c.env.DB, admin.id, 'Dispute Response Submitted', 
        `${user.name} has responded to dispute #${id}`, 'dispute', parseInt(id))
    }
    return c.json({ message: 'Response submitted' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/disputes/:id/resolve - Admin resolves dispute
disputes.patch('/:id/resolve', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id')
    const { resolution, winner, refund_amount, notes } = await c.req.json()
    if (!resolution) return c.json({ error: 'resolution required' }, 400)
    const dispute = await c.env.DB.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first() as any
    if (!dispute) return c.json({ error: 'Dispute not found' }, 404)
    await c.env.DB.prepare(`
      UPDATE disputes SET status = 'resolved', resolution = ?, winner = ?, refund_amount = ?, admin_notes = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(resolution, winner || null, refund_amount || 0, notes || null, id).run()
    // Notify both parties
    for (const uid of [dispute.customer_id, dispute.vendor_id]) {
      if (uid) await createNotification(c.env.DB, uid, 'Dispute Resolved', 
        `Dispute #${id} has been resolved. ${resolution.substring(0, 100)}`, 'dispute', parseInt(id))
    }
    return c.json({ message: 'Dispute resolved' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default disputes
