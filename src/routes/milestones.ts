// src/routes/milestones.ts - Project milestones & progress tracking
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification, sanitize } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const milestones = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/milestones/project/:id - Get milestones for a project
milestones.get('/project/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Access check
    if (user.role === 'customer' && project.customer_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    if (user.role === 'vendor') {
      const bid = await c.env.DB.prepare("SELECT id FROM bids WHERE project_id = ? AND vendor_id = ? AND status = 'accepted'").bind(projectId, user.id).first()
      if (!bid) return c.json({ error: 'Forbidden' }, 403)
    }

    const result = await c.env.DB.prepare(
      'SELECT * FROM milestones WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC'
    ).bind(projectId).all()
    return c.json({ milestones: result.results, project })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/milestones/project/:id - Create milestone (customer or vendor on active project)
milestones.post('/project/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')
    const { title, description, due_date, amount, sort_order } = await c.req.json()
    if (!title) return c.json({ error: 'Milestone title required' }, 400)

    const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ? AND status IN ('vendor_selected','in_progress')").bind(projectId).first() as any
    if (!project) return c.json({ error: 'Project not active' }, 404)
    if (user.role === 'customer' && project.customer_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

    const result = await c.env.DB.prepare(
      'INSERT INTO milestones (project_id, title, description, due_date, amount, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(projectId, sanitize(title), sanitize(description || ''), due_date || null, amount || null, sort_order || 0, 'pending').run()

    // Notify the other party
    const notifyId = user.role === 'customer' ? project.vendor_id : project.customer_id
    if (notifyId) await createNotification(c.env.DB, notifyId, '📌 New Milestone Added', `Milestone "${title}" added to your project.`, 'milestone', parseInt(projectId), 'project')

    return c.json({ milestone: { id: result.meta.last_row_id, title, status: 'pending' } }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/milestones/:id/status - Update milestone status (vendor marks done, customer approves)
milestones.patch('/:id/status', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const { status, completion_note } = await c.req.json()
    const allowed = ['pending', 'in_progress', 'completed', 'approved']
    if (!allowed.includes(status)) return c.json({ error: 'Invalid status' }, 400)

    const milestone = await c.env.DB.prepare(`
      SELECT m.*, p.customer_id, p.vendor_id, p.title as project_title
      FROM milestones m JOIN projects p ON m.project_id = p.id
      WHERE m.id = ?
    `).bind(id).first() as any
    if (!milestone) return c.json({ error: 'Milestone not found' }, 404)

    // Vendors can mark in_progress / completed, customers can approve
    if (user.role === 'vendor' && !['in_progress', 'completed'].includes(status)) return c.json({ error: 'Vendors can only mark in_progress or completed' }, 403)
    if (user.role === 'customer' && status !== 'approved') return c.json({ error: 'Customers can only approve completed milestones' }, 403)

    await c.env.DB.prepare(
      "UPDATE milestones SET status = ?, completion_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(status, sanitize(completion_note || ''), id).run()

    // Check if all milestones are approved → auto-suggest project completion
    if (status === 'approved') {
      const pending = await c.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM milestones WHERE project_id = ? AND status != 'approved'"
      ).bind(milestone.project_id).first() as any
      if (pending?.cnt === 0) {
        await createNotification(c.env.DB, milestone.customer_id, '🎉 All Milestones Complete!', `All milestones for "${milestone.project_title}" are approved. You can now mark the project as complete.`, 'milestone', milestone.project_id, 'project')
      }
    }

    const notifyId = user.role === 'vendor' ? milestone.customer_id : milestone.vendor_id
    if (notifyId) {
      const msg = status === 'completed' ? `Milestone "${milestone.title}" marked as complete. Please review and approve.`
        : status === 'approved' ? `Milestone "${milestone.title}" has been approved!`
        : `Milestone "${milestone.title}" is now in progress.`
      await createNotification(c.env.DB, notifyId, '📋 Milestone Update', msg, 'milestone', milestone.project_id, 'project')
    }

    return c.json({ message: 'Milestone updated' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// DELETE /api/milestones/:id - Delete milestone (customer only, if pending)
milestones.delete('/:id', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const milestone = await c.env.DB.prepare(`
      SELECT m.* FROM milestones m JOIN projects p ON m.project_id = p.id
      WHERE m.id = ? AND p.customer_id = ? AND m.status = 'pending'
    `).bind(id, user.id).first()
    if (!milestone) return c.json({ error: 'Milestone not found or cannot be deleted' }, 404)
    await c.env.DB.prepare('DELETE FROM milestones WHERE id = ?').bind(id).run()
    return c.json({ message: 'Milestone deleted' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default milestones
