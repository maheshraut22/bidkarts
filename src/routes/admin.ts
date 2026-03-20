// src/routes/admin.ts - Admin dashboard routes (upgraded v3)
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const admin = new Hono<{ Bindings: Env; Variables: Variables }>()

admin.use('*', authMiddleware, requireRole('admin'))

// ── Stats ────────────────────────────────────────────────────────────────────
admin.get('/stats', async (c) => {
  try {
    const [users, projects, payments, bids, consultations, disputes] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) as total,
        COUNT(CASE WHEN role='customer' THEN 1 END) as customers,
        COUNT(CASE WHEN role='vendor' THEN 1 END) as vendors,
        COUNT(CASE WHEN role='expert' THEN 1 END) as experts
        FROM users WHERE is_active=1`).first(),
      c.env.DB.prepare(`SELECT COUNT(*) as total,
        COUNT(CASE WHEN status='open' THEN 1 END) as open,
        COUNT(CASE WHEN status='in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status='completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status='bidding' THEN 1 END) as bidding,
        COUNT(CASE WHEN status='suspended' THEN 1 END) as suspended
        FROM projects`).first(),
      c.env.DB.prepare(`SELECT COUNT(*) as total,
        SUM(CASE WHEN status='completed' THEN amount ELSE 0 END) as revenue,
        COUNT(CASE WHEN status='completed' THEN 1 END) as successful
        FROM payments`).first(),
      c.env.DB.prepare('SELECT COUNT(*) as total FROM bids').first(),
      c.env.DB.prepare('SELECT COUNT(*) as total FROM consultations').first(),
      c.env.DB.prepare("SELECT COUNT(*) as total FROM disputes WHERE status='open'").first()
    ])
    return c.json({ users, projects, payments, bids, consultations, disputes })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Users ─────────────────────────────────────────────────────────────────────
admin.get('/users', async (c) => {
  try {
    const { role, page = '1', search } = c.req.query()
    const limit = 20, offset = (parseInt(page) - 1) * limit
    let query = 'SELECT id, name, email, phone, role, is_verified, is_active, created_at, subscription_plan FROM users WHERE 1=1'
    const params: any[] = []
    if (role) { query += ' AND role = ?'; params.push(role) }
    if (search) { query += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const result = await c.env.DB.prepare(query).bind(...params).all()
    const total = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first<{cnt:number}>()
    return c.json({ users: result.results, total: total?.cnt || 0 })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/users/:id/toggle', async (c) => {
  try {
    const id = c.req.param('id')
    const user = await c.env.DB.prepare('SELECT is_active, name FROM users WHERE id = ?').bind(id).first() as any
    if (!user) return c.json({ error: 'User not found' }, 404)
    await c.env.DB.prepare('UPDATE users SET is_active = ? WHERE id = ?').bind(user.is_active ? 0 : 1, id).run()
    return c.json({ message: `User ${user.is_active ? 'deactivated' : 'activated'}`, is_active: !user.is_active })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.delete('/users/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(id).run()
    return c.json({ message: 'User deactivated (soft delete)' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Vendor Approvals ──────────────────────────────────────────────────────────
admin.get('/vendors/pending', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.created_at,
        vp.company_name, vp.owner_name, vp.service_area, vp.certifications,
        vp.experience_years, vp.services_offered, vp.is_approved, vp.description, vp.subscription_plan
      FROM users u JOIN vendor_profiles vp ON vp.user_id = u.id
      WHERE u.role = 'vendor' AND vp.is_approved = 0
      ORDER BY u.created_at DESC`).all()
    return c.json({ vendors: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/vendors/:id/approve', async (c) => {
  try {
    const id = c.req.param('id')
    const { approved, reason } = await c.req.json()
    await c.env.DB.prepare('UPDATE vendor_profiles SET is_approved = ? WHERE user_id = ?').bind(approved ? 1 : 0, id).run()
    await createNotification(c.env.DB, parseInt(id),
      approved ? '✅ Vendor Profile Approved!' : '❌ Vendor Application Rejected',
      approved ? 'Congratulations! Your vendor profile has been approved. You can now submit bids on projects.' : `Your vendor application was not approved. ${reason || 'Please update your profile and reapply.'}`,
      approved ? 'success' : 'warning')
    return c.json({ message: approved ? 'Vendor approved' : 'Vendor rejected' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Projects (Full CRUD) ─────────────────────────────────────────────────────
admin.get('/projects', async (c) => {
  try {
    const { status, service_type, page = '1', search } = c.req.query()
    const limit = 20, offset = (parseInt(page) - 1) * limit
    let query = `SELECT p.*, u.name as customer_name, u.email as customer_email,
      (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count
      FROM projects p JOIN users u ON p.customer_id = u.id WHERE 1=1`
    const params: any[] = []
    if (status) { query += ' AND p.status = ?'; params.push(status) }
    if (service_type) { query += ' AND p.service_type = ?'; params.push(service_type) }
    if (search) { query += ' AND (p.title LIKE ? OR p.description LIKE ? OR u.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const result = await c.env.DB.prepare(query).bind(...params).all()
    const total = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM projects').first<{cnt:number}>()
    return c.json({ projects: result.results, total: total?.cnt || 0 })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.get('/projects/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const project = await c.env.DB.prepare(`
      SELECT p.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone
      FROM projects p JOIN users u ON p.customer_id = u.id WHERE p.id = ?`).bind(id).first()
    if (!project) return c.json({ error: 'Project not found' }, 404)
    const bids = await c.env.DB.prepare(`
      SELECT b.*, v.name as vendor_name, vp.company_name FROM bids b
      JOIN users v ON b.vendor_id = v.id LEFT JOIN vendor_profiles vp ON vp.user_id = b.vendor_id
      WHERE b.project_id = ?`).bind(id).all()
    const docs = await c.env.DB.prepare('SELECT * FROM documents WHERE project_id = ?').bind(id).all()
    return c.json({ project, bids: bids.results, documents: docs.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/projects/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { title, description, status, budget_min, budget_max, service_type, location, admin_note } = body
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    await c.env.DB.prepare(`UPDATE projects SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      budget_min = COALESCE(?, budget_min),
      budget_max = COALESCE(?, budget_max),
      service_type = COALESCE(?, service_type),
      location = COALESCE(?, location),
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).bind(title||null, description||null, status||null, budget_min||null, budget_max||null, service_type||null, location||null, id).run()
    if (status && status !== project.status) {
      await createNotification(c.env.DB, project.customer_id, '📋 Project Status Updated',
        `Your project "${project.title}" status has been changed to "${status}" by Admin.${admin_note ? ' Note: ' + admin_note : ''}`, 'project', parseInt(id))
    }
    return c.json({ message: 'Project updated successfully' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.delete('/projects/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    await c.env.DB.prepare('DELETE FROM bids WHERE project_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM documents WHERE project_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
    await createNotification(c.env.DB, project.customer_id, '⚠️ Project Removed',
      `Your project "${project.title}" has been removed by the admin.`, 'warning', parseInt(id))
    return c.json({ message: 'Project deleted' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/projects/:id/suspend', async (c) => {
  try {
    const id = c.req.param('id')
    const { reason } = await c.req.json()
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    const newStatus = project.status === 'suspended' ? 'open' : 'suspended'
    await c.env.DB.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(newStatus, id).run()
    await createNotification(c.env.DB, project.customer_id,
      newStatus === 'suspended' ? '🚫 Project Suspended' : '✅ Project Reinstated',
      newStatus === 'suspended'
        ? `Your project "${project.title}" has been suspended. ${reason || 'Contact support for details.'}`
        : `Your project "${project.title}" has been reinstated and is now live.`,
      newStatus === 'suspended' ? 'warning' : 'success', parseInt(id))
    return c.json({ message: `Project ${newStatus}`, status: newStatus })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/projects/:id/flag', async (c) => {
  try {
    const id = c.req.param('id')
    const { reason } = await c.req.json()
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    await c.env.DB.prepare("UPDATE projects SET status = 'flagged', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run()
    await createNotification(c.env.DB, project.customer_id, '🚩 Project Flagged',
      `Your project "${project.title}" has been flagged for review: ${reason || 'Suspicious activity detected.'}`, 'warning', parseInt(id))
    return c.json({ message: 'Project flagged as fraudulent' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Payments ──────────────────────────────────────────────────────────────────
admin.get('/payments', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT pay.*, u.name as user_name, u.email as user_email, p.title as project_title
      FROM payments pay JOIN users u ON pay.user_id = u.id
      LEFT JOIN projects p ON pay.project_id = p.id
      ORDER BY pay.created_at DESC LIMIT 50`).all()
    return c.json({ payments: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Expert Requests Management ────────────────────────────────────────────────
admin.get('/consultations', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT con.*, cu.name as customer_name, ex.name as expert_name,
        ep.specialization, ep.certification
      FROM consultations con
      JOIN users cu ON con.customer_id = cu.id
      JOIN users ex ON con.expert_id = ex.id
      LEFT JOIN expert_profiles ep ON ep.user_id = con.expert_id
      ORDER BY con.created_at DESC LIMIT 50`).all()
    return c.json({ consultations: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Disputes ──────────────────────────────────────────────────────────────────
admin.get('/disputes', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT d.*, p.title as project_title,
        cu.name as customer_name, ex.name as vendor_name,
        rb.name as raised_by_name
      FROM disputes d
      JOIN projects p ON d.project_id = p.id
      JOIN users cu ON d.customer_id = cu.id
      LEFT JOIN users ex ON d.vendor_id = ex.id
      JOIN users rb ON d.raised_by = rb.id
      ORDER BY d.created_at DESC LIMIT 50`).all()
    return c.json({ disputes: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/disputes/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id')
    const { resolution, winner, refund_amount, admin_notes } = await c.req.json()
    const dispute = await c.env.DB.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first() as any
    if (!dispute) return c.json({ error: 'Dispute not found' }, 404)
    await c.env.DB.prepare(`UPDATE disputes SET status='resolved', resolution=?, winner=?, refund_amount=?, admin_notes=?, resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(resolution, winner || null, refund_amount || 0, admin_notes || null, id).run()
    await createNotification(c.env.DB, dispute.customer_id, '⚖️ Dispute Resolved',
      `Your dispute has been resolved. ${resolution}`, 'info', parseInt(id))
    if (dispute.vendor_id) {
      await createNotification(c.env.DB, dispute.vendor_id, '⚖️ Dispute Resolved',
        `A dispute related to your project has been resolved. ${resolution}`, 'info', parseInt(id))
    }
    return c.json({ message: 'Dispute resolved' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Subscription Plans ────────────────────────────────────────────────────────
admin.get('/subscriptions/plans', async (c) => {
  try {
    const plans = [
      { id: 'free', name: 'Basic', price: 0, bid_limit: 5, features: ['5 bids/month','Standard listing','Basic support'], color: '#64748b' },
      { id: 'pro', name: 'Pro', price: 2999, bid_limit: -1, features: ['Unlimited bids','Priority listing','Analytics dashboard','Email support'], color: '#2563eb' },
      { id: 'premium', name: 'Premium', price: 5999, bid_limit: -1, features: ['Unlimited bids','Featured vendor badge','Top listing','Analytics','Dedicated support','Profile verification badge'], color: '#7c3aed' }
    ]
    return c.json({ plans })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/subscriptions/vendor/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { plan } = await c.req.json()
    if (!['free', 'pro', 'premium'].includes(plan)) return c.json({ error: 'Invalid plan' }, 400)
    await c.env.DB.prepare('UPDATE vendor_profiles SET subscription_plan = ? WHERE user_id = ?').bind(plan, id).run()
    await c.env.DB.prepare('UPDATE users SET subscription_plan = ? WHERE id = ?').bind(plan, id).run()
    await createNotification(c.env.DB, parseInt(id), '🎉 Subscription Updated',
      `Your vendor subscription has been updated to ${plan.toUpperCase()} plan by Admin.`, 'success')
    return c.json({ message: `Vendor plan updated to ${plan}` })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Chat Moderation ───────────────────────────────────────────────────────────
admin.get('/chats', async (c) => {
  try {
    const result = await c.env.DB.prepare(`
      SELECT conv.id, conv.project_id, p.title as project_title,
        cu.name as customer_name, vu.name as vendor_name,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = conv.id) as message_count,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = conv.id AND is_flagged = 1) as flagged_count,
        (SELECT created_at FROM messages WHERE conversation_id = conv.id ORDER BY created_at DESC LIMIT 1) as last_activity
      FROM conversations conv
      JOIN projects p ON conv.project_id = p.id
      JOIN users cu ON conv.customer_id = cu.id
      JOIN users vu ON conv.vendor_id = vu.id
      ORDER BY last_activity DESC LIMIT 50`).all()
    return c.json({ conversations: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.get('/chats/:id/messages', async (c) => {
  try {
    const id = c.req.param('id')
    const result = await c.env.DB.prepare(`
      SELECT m.*, u.name as sender_name, u.role as sender_role
      FROM messages m JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ? ORDER BY m.created_at ASC`).bind(id).all()
    return c.json({ messages: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.delete('/chats/messages/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run()
    return c.json({ message: 'Message deleted' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/chats/messages/:id/flag', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('UPDATE messages SET is_flagged = 1 WHERE id = ?').bind(id).run()
    return c.json({ message: 'Message flagged' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── AI Knowledge Base Management ──────────────────────────────────────────────
// Alias: /admin/ai-responses (primary) and /admin/ai-knowledge (legacy)
admin.get('/ai-responses', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM ai_responses ORDER BY updated_at DESC LIMIT 100'
    ).all()
    return c.json({ responses: result.results, ai_responses: result.results })
  } catch (e: any) { return c.json({ responses: [], ai_responses: [] }) }
})

admin.get('/ai-knowledge', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM ai_responses ORDER BY updated_at DESC LIMIT 100'
    ).all()
    return c.json({ responses: result.results, ai_responses: result.results })
  } catch (e: any) { return c.json({ responses: [], ai_responses: [] }) }
})

admin.post('/ai-knowledge', async (c) => {
  try {
    const { question, answer, category, is_approved } = await c.req.json()
    if (!question || !answer) return c.json({ error: 'Question and answer required' }, 400)
    const result = await c.env.DB.prepare(
      'INSERT INTO ai_responses (question, answer, category, is_approved) VALUES (?, ?, ?, ?)'
    ).bind(question, answer, category || 'general', is_approved !== undefined ? (is_approved ? 1 : 0) : 1).run()
    return c.json({ message: 'AI response created', id: result.meta.last_row_id }, 201)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/ai-knowledge/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { question, answer, is_approved, category } = await c.req.json()
    const existing = await c.env.DB.prepare('SELECT version FROM ai_responses WHERE id = ?').bind(id).first() as any
    await c.env.DB.prepare(
      'UPDATE ai_responses SET question = COALESCE(?, question), answer = COALESCE(?, answer), is_approved = COALESCE(?, is_approved), category = COALESCE(?, category), version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(question || null, answer || null, is_approved !== undefined ? (is_approved ? 1 : 0) : null, category || null, ((existing?.version || 1) + 1), id).run()
    return c.json({ message: 'AI response updated' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.delete('/ai-knowledge/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM ai_responses WHERE id = ?').bind(id).run()
    return c.json({ message: 'AI response deleted' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Subscription alias (shortcut) ────────────────────────────────────────────
admin.get('/subscriptions', async (c) => {
  const plans = [
    { id: 'free', name: 'Basic', price: 0, bid_limit: 5, features: ['5 bids/month','Standard listing','Basic support'], color: '#64748b' },
    { id: 'pro', name: 'Pro', price: 2999, bid_limit: -1, features: ['Unlimited bids','Priority listing','Analytics','Email support'], color: '#2563eb' },
    { id: 'premium', name: 'Premium', price: 5999, bid_limit: -1, features: ['Unlimited bids','Featured badge','Top listing','Analytics','Dedicated support','Verification badge'], color: '#7c3aed' }
  ]
  return c.json({ plans })
})

admin.get('/ai/responses', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      'SELECT * FROM ai_responses ORDER BY updated_at DESC LIMIT 50'
    ).all()
    return c.json({ responses: result.results })
  } catch (e: any) { return c.json({ responses: [] }) }
})

admin.post('/ai/responses', async (c) => {
  try {
    const { question, answer, category, is_approved } = await c.req.json()
    if (!question || !answer) return c.json({ error: 'Question and answer required' }, 400)
    const result = await c.env.DB.prepare(
      'INSERT INTO ai_responses (question, answer, category, is_approved) VALUES (?, ?, ?, ?)'
    ).bind(question, answer, category || 'general', is_approved ? 1 : 0).run()
    return c.json({ message: 'AI response created', id: result.meta.last_row_id }, 201)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.patch('/ai/responses/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { answer, is_approved, category } = await c.req.json()
    await c.env.DB.prepare(
      'UPDATE ai_responses SET answer = COALESCE(?, answer), is_approved = COALESCE(?, is_approved), category = COALESCE(?, category), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(answer || null, is_approved !== undefined ? (is_approved ? 1 : 0) : null, category || null, id).run()
    return c.json({ message: 'AI response updated' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

admin.delete('/ai/responses/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM ai_responses WHERE id = ?').bind(id).run()
    return c.json({ message: 'AI response deleted' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Analytics ─────────────────────────────────────────────────────────────────
admin.get('/analytics', async (c) => {
  try {
    const [revenueByMonth, topVendors, serviceBreakdown, recentActivity] = await Promise.all([
      c.env.DB.prepare(`SELECT TO_CHAR(created_at, 'YYYY-MM') as month, SUM(amount) as revenue, COUNT(*) as transactions
        FROM payments WHERE status='completed' GROUP BY month ORDER BY month DESC LIMIT 12`).all(),
      c.env.DB.prepare(`SELECT u.name, vp.company_name, vp.rating, vp.total_reviews, vp.total_projects, vp.subscription_plan
        FROM vendor_profiles vp JOIN users u ON vp.user_id = u.id
        WHERE vp.is_approved=1 ORDER BY vp.rating DESC, vp.total_reviews DESC LIMIT 10`).all(),
      c.env.DB.prepare(`SELECT service_type, COUNT(*) as count FROM projects GROUP BY service_type ORDER BY count DESC`).all(),
      c.env.DB.prepare(`SELECT 'project' as type, title as description, created_at FROM projects
        UNION ALL SELECT 'user' as type, email as description, created_at FROM users
        ORDER BY created_at DESC LIMIT 20`).all()
    ])
    return c.json({ revenue_by_month: revenueByMonth.results, top_vendors: topVendors.results, service_breakdown: serviceBreakdown.results, recent_activity: recentActivity.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Inspections Admin Control ──────────────────────────────────────────────────
admin.get('/inspections', async (c) => {
  try {
    const { status, page = '1' } = c.req.query()
    const limit = 20, offset = (parseInt(page) - 1) * limit
    let query = `SELECT i.*, p.title as project_title, p.service_type, p.location,
      c.name as customer_name, c.phone as customer_phone,
      e.name as expert_name, e.phone as expert_phone
      FROM inspections i
      JOIN projects p ON i.project_id = p.id
      JOIN users c ON i.customer_id = c.id
      LEFT JOIN users e ON i.expert_id = e.id
      WHERE 1=1`
    const params: any[] = []
    if (status) { query += ' AND i.status = ?'; params.push(status) }
    query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    const result = await c.env.DB.prepare(query).bind(...params).all()
    const total = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM inspections').first() as any
    return c.json({ inspections: result.results, total: total?.cnt || 0 })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Admin: Assign expert to inspection ────────────────────────────────────────
admin.patch('/inspections/:id/assign', async (c) => {
  try {
    const id = c.req.param('id')
    const { expert_id, visit_date, notes } = await c.req.json()
    if (!expert_id) return c.json({ error: 'expert_id required' }, 400)

    const inspection = await c.env.DB.prepare('SELECT * FROM inspections WHERE id = ?').bind(id).first() as any
    if (!inspection) return c.json({ error: 'Inspection not found' }, 404)

    await c.env.DB.prepare(
      "UPDATE inspections SET expert_id=?, visit_date=?, status='assigned', admin_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(expert_id, visit_date || null, notes || null, id).run()

    await createNotification(c.env.DB, expert_id, '📋 New Inspection Assigned',
      `You have been assigned a technical inspection. Visit date: ${visit_date || 'TBD'}`,
      'inspection', parseInt(id), 'inspection')
    await createNotification(c.env.DB, inspection.customer_id, '✅ Expert Assigned to Inspection',
      `An expert has been assigned to your inspection request. Expected visit: ${visit_date || 'TBD'}`,
      'inspection', parseInt(id), 'inspection')

    return c.json({ message: 'Expert assigned to inspection' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Admin: Update inspection status ──────────────────────────────────────────
admin.patch('/inspections/:id/status', async (c) => {
  try {
    const id = c.req.param('id')
    const { status, notes } = await c.req.json()
    if (!status) return c.json({ error: 'status required' }, 400)

    const inspection = await c.env.DB.prepare('SELECT * FROM inspections WHERE id = ?').bind(id).first() as any
    if (!inspection) return c.json({ error: 'Inspection not found' }, 404)

    await c.env.DB.prepare(
      'UPDATE inspections SET status=?, admin_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(status, notes || inspection.admin_notes, id).run()

    await createNotification(c.env.DB, inspection.customer_id, '🔍 Inspection Status Updated',
      `Your inspection status has been updated to: ${status}. ${notes || ''}`,
      'inspection', parseInt(id), 'inspection')

    return c.json({ message: 'Inspection status updated' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

export default admin
