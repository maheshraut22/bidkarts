// src/routes/bids.ts - Bidding routes
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification, sendEmailNotification } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const bids = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/bids/project/:id - Get bids for a project
bids.get('/project/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')

    // Check access: customer who owns project, admin, or vendor with accepted bid
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    if (user.role === 'customer' && project.customer_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const result = await c.env.DB.prepare(`
      SELECT b.*, u.name as vendor_name, u.email as vendor_email, u.phone as vendor_phone,
        vp.company_name, vp.rating, vp.total_reviews, vp.experience_years, 
        vp.certifications, vp.services_offered, vp.description as company_description,
        vp.logo_url
      FROM bids b
      JOIN users u ON b.vendor_id = u.id
      LEFT JOIN vendor_profiles vp ON vp.user_id = b.vendor_id
      WHERE b.project_id = ?
      ORDER BY b.bid_amount ASC
    `).bind(projectId).all()

    // Vendors can see bids; check if their bid is accepted for document access
    let vendorBidStatus = null
    let hasPaidPlatformFee = false
    if (user.role === 'vendor') {
      const myBid = (result.results as any[]).find((b: any) => b.vendor_id === user.id)
      vendorBidStatus = myBid?.status || null
      // Check if vendor has paid platform fee for this project
      if (vendorBidStatus === 'accepted') {
        const feePayment = await c.env.DB.prepare(
          `SELECT id FROM payments WHERE user_id=? AND project_id=? AND payment_type='platform_fee' AND status='completed'`
        ).bind(user.id, projectId).first()
        hasPaidPlatformFee = !!feePayment
      }
    }

    return c.json({ bids: result.results, project, vendor_bid_status: vendorBidStatus, has_paid_platform_fee: hasPaidPlatformFee })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/bids/vendor/my - Get vendor's own bids
bids.get('/vendor/my', authMiddleware, requireRole('vendor'), async (c) => {
  try {
    const user = c.get('user')
    const result = await c.env.DB.prepare(`
      SELECT b.*, p.title as project_title, p.service_type, p.status as project_status,
        p.location, p.budget_min, p.budget_max, p.customer_id,
        u.name as customer_name
      FROM bids b
      JOIN projects p ON b.project_id = p.id
      JOIN users u ON p.customer_id = u.id
      WHERE b.vendor_id = ?
      ORDER BY b.created_at DESC
    `).bind(user.id).all()

    return c.json({ bids: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/bids - Submit a bid
bids.post('/', authMiddleware, requireRole('vendor'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const { project_id, bid_amount, timeline_days, equipment_details, warranty_details, message } = body

    if (!project_id || !bid_amount || !timeline_days) {
      return c.json({ error: 'Project ID, bid amount, and timeline are required' }, 400)
    }

    const project = await c.env.DB.prepare(
      "SELECT * FROM projects WHERE id = ? AND status IN ('open','bidding')"
    ).bind(project_id).first() as any
    if (!project) return c.json({ error: 'Project not available for bidding' }, 404)

    // Check if vendor already bid
    const existingBid = await c.env.DB.prepare(
      'SELECT id FROM bids WHERE project_id = ? AND vendor_id = ?'
    ).bind(project_id, user.id).first()
    if (existingBid) return c.json({ error: 'You already submitted a bid for this project' }, 409)

    const result = await c.env.DB.prepare(`
      INSERT INTO bids (project_id, vendor_id, bid_amount, timeline_days, equipment_details, warranty_details, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(project_id, user.id, bid_amount, timeline_days, equipment_details || null, warranty_details || null, message || null).run()

    // Update project status to bidding
    await c.env.DB.prepare(
      "UPDATE projects SET status = 'bidding', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'"
    ).bind(project_id).run()

    // Notify customer
    const vendorProfile = await c.env.DB.prepare('SELECT company_name FROM vendor_profiles WHERE user_id = ?').bind(user.id).first() as any
    const companyName = vendorProfile?.company_name || user.name
    await createNotification(c.env.DB, project.customer_id, '📋 New Bid Received', `${companyName} submitted a bid of ₹${bid_amount.toLocaleString()} for "${project.title}"`, 'bid', project_id, 'project')

    // Send email to customer about new bid
    const customerUser = await c.env.DB.prepare('SELECT email, name FROM users WHERE id = ?').bind(project.customer_id).first() as any
    if (customerUser) {
      await sendEmailNotification(c.env, {
        to: customerUser.email,
        subject: `New bid received for "${project.title}"`,
        template: 'bid_received',
        data: {
          customerName: customerUser.name,
          projectTitle: project.title,
          vendorName: companyName,
          bidAmount: bid_amount,
          timelineDays: timeline_days,
          projectId: project_id
        }
      })
    }

    // Send email confirmation to vendor
    await sendEmailNotification(c.env, {
      to: user.email,
      subject: `Bid submitted for "${project.title}"`,
      template: 'bid_submitted',
      data: {
        vendorName: companyName,
        projectTitle: project.title,
        bidAmount: bid_amount,
        timelineDays: timeline_days,
        projectId: project_id
      }
    })

    // In-app notification for vendor
    await createNotification(c.env.DB, user.id, '✅ Bid Submitted!', `Your bid of ₹${bid_amount.toLocaleString()} for "${project.title}" has been submitted.`, 'bid', project_id, 'project')

    return c.json({ bid: { id: result.meta.last_row_id, project_id, bid_amount }, message: 'Bid submitted successfully' }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// PATCH /api/bids/:id - Update bid
bids.patch('/:id', authMiddleware, requireRole('vendor'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = await c.req.json()

    const bid = await c.env.DB.prepare('SELECT * FROM bids WHERE id = ? AND vendor_id = ?').bind(id, user.id).first() as any
    if (!bid) return c.json({ error: 'Bid not found' }, 404)
    if (bid.status !== 'pending') return c.json({ error: 'Cannot update accepted/rejected bid' }, 400)

    const { bid_amount, timeline_days, message, equipment_details, warranty_details } = body
    await c.env.DB.prepare(`
      UPDATE bids SET bid_amount = ?, timeline_days = ?, message = ?, equipment_details = ?, warranty_details = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(bid_amount || bid.bid_amount, timeline_days || bid.timeline_days, message || bid.message, equipment_details || bid.equipment_details, warranty_details || bid.warranty_details, id).run()

    return c.json({ message: 'Bid updated successfully' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// DELETE /api/bids/:id - Withdraw bid
bids.delete('/:id', authMiddleware, requireRole('vendor'), async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const bid = await c.env.DB.prepare('SELECT * FROM bids WHERE id = ? AND vendor_id = ?').bind(id, user.id).first()
    if (!bid) return c.json({ error: 'Bid not found' }, 404)
    await c.env.DB.prepare("UPDATE bids SET status = 'withdrawn' WHERE id = ?").bind(id).run()
    return c.json({ message: 'Bid withdrawn' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/bids/project/:id/documents - Vendor views project documents (AFTER paying platform fee)
bids.get('/project/:id/documents', authMiddleware, requireRole('vendor', 'customer', 'admin'), async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Customers and admins can always see documents
    if (user.role === 'customer') {
      if (project.customer_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    } else if (user.role === 'vendor') {
      // Vendor must have an accepted bid AND paid platform fee
      const myBid = await c.env.DB.prepare(
        "SELECT * FROM bids WHERE project_id=? AND vendor_id=? AND status='accepted'"
      ).bind(projectId, user.id).first() as any
      if (!myBid) return c.json({ error: 'Access denied. Your bid must be accepted to view documents.' }, 403)

      const feePayment = await c.env.DB.prepare(
        `SELECT id FROM payments WHERE user_id=? AND project_id=? AND payment_type='platform_fee' AND status='completed'`
      ).bind(user.id, projectId).first()
      if (!feePayment) {
        return c.json({
          error: 'Please pay the platform fee to access project documents.',
          requires_payment: true,
          payment_type: 'platform_fee',
          project_id: projectId
        }, 402)
      }
    }

    const docs = await c.env.DB.prepare(
      'SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC'
    ).bind(projectId).all()

    return c.json({ documents: docs.results, project_title: project.title })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default bids
