// src/routes/projects.ts - Project management routes
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification, sendEmailNotification } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const projects = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/projects - List projects (public for vendors, filtered for customers)
projects.get('/', async (c) => {
  try {
    const { page = '1', limit = '10', service_type, status, search, location } = c.req.query()
    const pageNum = parseInt(page), limitNum = Math.min(parseInt(limit), 50)
    const offset = (pageNum - 1) * limitNum

    let query = `
      SELECT p.*, u.name as customer_name, u.avatar_url as customer_avatar,
        (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count
      FROM projects p
      JOIN users u ON p.customer_id = u.id
      WHERE 1=1
    `
    const params: any[] = []

    if (service_type) { query += ' AND p.service_type = ?'; params.push(service_type) }
    if (status) { query += ' AND p.status = ?'; params.push(status) }
    else { query += " AND p.status IN ('open','bidding')" }
    if (search) { query += ' AND (p.title LIKE ? OR p.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    if (location) { query += ' AND p.location LIKE ?'; params.push(`%${location}%`) }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?'
    params.push(limitNum, offset)

    const result = await c.env.DB.prepare(query).bind(...params).all()
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM projects p WHERE p.status IN ('open','bidding')`
    ).first() as any

    return c.json({
      projects: result.results,
      pagination: { page: pageNum, limit: limitNum, total: countResult?.total || 0 }
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/projects/live - Get live/active projects for homepage ticker
projects.get('/live', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT p.id, p.title, p.service_type, p.location, p.budget_min, p.budget_max, p.status, p.created_at,
        u.name as customer_name,
        (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count
      FROM projects p
      JOIN users u ON p.customer_id = u.id
      WHERE p.status IN ('open','bidding')
      ORDER BY p.created_at DESC
      LIMIT 20
    `).all()
    return c.json({ projects: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/projects/:id - Get single project
projects.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const project = await c.env.DB.prepare(`
      SELECT p.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
        u.avatar_url as customer_avatar,
        (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count
      FROM projects p
      JOIN users u ON p.customer_id = u.id
      WHERE p.id = ?
    `).bind(id).first()

    if (!project) return c.json({ error: 'Project not found' }, 404)

    const docs = await c.env.DB.prepare(
      'SELECT * FROM documents WHERE project_id = ?'
    ).bind(id).all()

    return c.json({ project, documents: docs.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/projects - Create project (customer only)
projects.post('/', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const {
      service_type, title, description, location, property_type,
      budget_min, budget_max, timeline,
      bid_opening_date, bid_closing_date, expert_support,
      documents_info
    } = body

    if (!service_type || !title || !description || !location) {
      return c.json({ error: 'Service type, title, description, and location are required' }, 400)
    }

    // ── Subscription limit check: Free users max 10 projects ─────────────────
    const subResult = await c.env.DB.prepare(
      `SELECT subscription_plan FROM users WHERE id = ?`
    ).bind(user.id).first() as any
    const plan = subResult?.subscription_plan || 'free'

    if (plan === 'free') {
      const countResult = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM projects WHERE customer_id = ? AND status NOT IN ('cancelled')`
      ).bind(user.id).first() as any
      const projectCount = countResult?.cnt || 0
      if (projectCount >= 10) {
        return c.json({
          error: 'Free plan limit reached. You can post maximum 10 projects on the free plan. Please upgrade to Pro or Premium to post more projects.',
          limit_reached: true,
          current_count: projectCount,
          max_allowed: 10,
          upgrade_url: '/vendor-plans'
        }, 403)
      }
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO projects (customer_id, service_type, title, description, location, property_type,
        budget_min, budget_max, timeline, bid_opening_date, bid_closing_date, expert_support, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `).bind(
      user.id, service_type, title, description, location,
      property_type || null, budget_min || null, budget_max || null,
      timeline || null, bid_opening_date || null, bid_closing_date || null,
      expert_support ? 1 : 0
    ).run()

    const projectId = result.meta.last_row_id as number

    // Create in-app notification for customer
    await createNotification(
      c.env.DB, user.id,
      '✅ Project Posted Successfully!',
      `Your project "${title}" is now live and open for bids.`,
      'project', projectId, 'project'
    )

    // Send email notification
    await sendEmailNotification(c.env, {
      to: user.email,
      subject: `Your project "${title}" is now live on BidKarts`,
      template: 'project_posted',
      data: {
        customerName: user.name,
        projectTitle: title,
        serviceType: service_type,
        location,
        projectId
      }
    })

    // Notify all active vendors about new project
    try {
      const vendors = await c.env.DB.prepare(
        `SELECT u.id, u.email, u.name FROM users u
         JOIN vendor_profiles vp ON vp.user_id = u.id
         WHERE u.role = 'vendor' AND u.is_active = 1 AND vp.is_approved = 1
         AND (vp.services_offered LIKE ? OR vp.services_offered IS NULL)
         LIMIT 50`
      ).bind(`%${service_type}%`).all()

      for (const vendor of vendors.results as any[]) {
        await createNotification(
          c.env.DB, vendor.id,
          '🆕 New Project Available!',
          `A new ${service_type} project "${title}" has been posted in ${location}. Budget: ₹${budget_min || 'Flexible'}`,
          'project', projectId, 'project'
        )
      }
    } catch {}

    return c.json({ project: { id: projectId, title, service_type, status: 'open' }, message: 'Project posted successfully' }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/projects/:id - Update project (customer: only before bids; admin: anytime)
projects.patch('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = await c.req.json()

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    if (project.customer_id !== user.id && user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Customer can only edit if no bids received yet
    if (user.role === 'customer') {
      const bidCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM bids WHERE project_id = ?').bind(id).first() as any
      if ((bidCount?.cnt || 0) > 0) {
        return c.json({
          error: 'Project cannot be edited after bids have been received. Please contact support if you need to make changes.',
          bid_count: bidCount?.cnt,
          can_edit: false
        }, 409)
      }
      // Customer allowed to edit only open/draft projects
      if (!['open', 'bidding'].includes(project.status)) {
        return c.json({ error: 'Only open or bidding projects can be edited', can_edit: false }, 409)
      }
    }

    // Admin can edit any field; customer gets limited fields
    const adminFields = ['status', 'title', 'description', 'location', 'property_type',
      'timeline', 'bid_opening_date', 'bid_closing_date', 'expert_support', 'budget_min', 'budget_max', 'admin_notes']
    const customerFields = ['title', 'description', 'location', 'property_type',
      'timeline', 'bid_opening_date', 'bid_closing_date', 'expert_support', 'budget_min', 'budget_max']
    const allowedFields = user.role === 'admin' ? adminFields : customerFields

    const updates: string[] = []
    const values: any[] = []

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(body[field])
      }
    }

    if (updates.length === 0) return c.json({ error: 'Nothing to update' }, 400)
    values.push(id)

    await c.env.DB.prepare(`UPDATE projects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values).run()

    // Notify customer when admin edits
    if (user.role === 'admin' && project.customer_id) {
      await createNotification(c.env.DB, project.customer_id, '✏️ Project Updated by Admin',
        `Your project "${project.title}" has been updated by admin.`, 'project', parseInt(id), 'project')
    }

    return c.json({ message: 'Project updated successfully', can_edit: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/projects/my/list - Get customer's own projects
projects.get('/my/list', authMiddleware, requireRole('customer', 'admin'), async (c) => {
  try {
    const user = c.get('user')
    const clause = user.role === 'admin' ? '' : 'WHERE p.customer_id = ?'
    const params = user.role === 'admin' ? [] : [user.id]

    const result = await c.env.DB.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count,
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) as doc_count
      FROM projects p
      ${clause}
      ORDER BY p.created_at DESC
    `).bind(...params).all()

    return c.json({ projects: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/projects/:id/select-vendor
projects.post('/:id/select-vendor', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')
    const { bid_id, vendor_id } = await c.req.json()

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND customer_id = ?').bind(projectId, user.id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Accept the selected bid
    await c.env.DB.prepare("UPDATE bids SET status = 'accepted' WHERE id = ? AND project_id = ?").bind(bid_id, projectId).run()
    // Reject other bids
    await c.env.DB.prepare("UPDATE bids SET status = 'rejected' WHERE project_id = ? AND id != ?").bind(projectId, bid_id).run()
    // Update project with vendor_id
    await c.env.DB.prepare(
      "UPDATE projects SET status = 'vendor_selected', selected_vendor_id = ?, vendor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(vendor_id, vendor_id, projectId).run()

    // Notify selected vendor
    await createNotification(c.env.DB, vendor_id, '🎉 Bid Accepted!', `Your bid for "${project.title}" has been accepted!`, 'bid', parseInt(projectId), 'project')

    // Get vendor email and send email notification
    const vendorUser = await c.env.DB.prepare('SELECT email, name FROM users WHERE id = ?').bind(vendor_id).first() as any
    if (vendorUser) {
      await sendEmailNotification(c.env, {
        to: vendorUser.email,
        subject: `Congratulations! Your bid for "${project.title}" was accepted`,
        template: 'bid_accepted',
        data: {
          vendorName: vendorUser.name,
          projectTitle: project.title,
          projectId
        }
      })
    }

    return c.json({ message: 'Vendor selected successfully' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// DELETE /api/projects/:id/documents/:docId - Delete document (customer or admin)
projects.delete('/:id/documents/:docId', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')
    const docId = c.req.param('docId')

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    if (project.customer_id !== user.id && user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ? AND project_id = ?').bind(docId, projectId).first()
    if (!doc) return c.json({ error: 'Document not found' }, 404)

    await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(docId).run()
    return c.json({ message: 'Document deleted successfully' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/projects/:id/admin-edit - Admin full edit (description, status, etc.)
projects.patch('/:id/admin-edit', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    const allowedFields = ['status', 'title', 'description', 'location', 'property_type',
      'timeline', 'bid_opening_date', 'bid_closing_date', 'expert_support',
      'budget_min', 'budget_max', 'admin_notes']
    const updates: string[] = []
    const values: any[] = []

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(body[field])
      }
    }

    if (updates.length === 0) return c.json({ error: 'Nothing to update' }, 400)
    values.push(id)

    await c.env.DB.prepare(`UPDATE projects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values).run()

    // Notify customer of admin changes
    if (body.admin_notes || body.description || body.status) {
      await createNotification(c.env.DB, project.customer_id,
        '📝 Project Updated by Admin',
        `Your project "${project.title}" was updated by admin. ${body.admin_notes || 'Check your dashboard for details.'}`,
        'project', parseInt(id), 'project')
    }

    return c.json({ message: 'Project updated by admin successfully' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/projects/:id/complete - Mark project as complete (customer)
projects.post('/:id/complete', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')
    const { completion_note } = await c.req.json().catch(() => ({}))

    const project = await c.env.DB.prepare(
      "SELECT * FROM projects WHERE id = ? AND customer_id = ? AND status IN ('in_progress','vendor_selected')"
    ).bind(projectId, user.id).first() as any
    if (!project) return c.json({ error: 'Project not found or cannot be completed' }, 404)

    await c.env.DB.prepare(
      "UPDATE projects SET status = 'completed', completion_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(completion_note || '', projectId).run()

    // Notify vendor
    if (project.selected_vendor_id) {
      await createNotification(c.env.DB, project.selected_vendor_id, '🎉 Project Completed!', `Project "${project.title}" has been marked as complete by the customer.`, 'project', parseInt(projectId), 'project')
    }
    await createNotification(c.env.DB, user.id, '✅ Project Completed', `Your project "${project.title}" has been marked as complete.`, 'project', parseInt(projectId), 'project')

    return c.json({ message: 'Project marked as complete' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/projects/:id/documents - Upload document for project
projects.post('/:id/documents', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')

    // Verify project exists and user has access
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    if (project.customer_id !== user.id && user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const body = await c.req.json()
    const { doc_type, file_name, file_url, file_size } = body

    if (!doc_type || !file_name) return c.json({ error: 'doc_type and file_name required' }, 400)

    // Store as base64 data URL or external URL reference
    const stored_url = file_url || `data:uploaded/${file_name}`

    const result = await c.env.DB.prepare(
      `INSERT INTO documents (project_id, user_id, doc_type, file_name, file_url, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(parseInt(projectId), user.id, doc_type, file_name, stored_url, file_size || 0).run()

    return c.json({
      document: {
        id: result.meta.last_row_id,
        project_id: projectId,
        doc_type,
        file_name,
        file_url: stored_url,
        file_size
      },
      message: 'Document uploaded'
    }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default projects
