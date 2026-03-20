// src/routes/shortlist.ts - Vendor Shortlist for Customers
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import type { Env } from '../lib/db'

type Variables = { user: any }
const shortlist = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/shortlist - Get customer's shortlisted vendors
shortlist.get('/', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const result = await c.env.DB.prepare(`
      SELECT sl.*, u.name as vendor_name, u.email as vendor_email,
        vp.company_name, vp.rating, vp.total_reviews, vp.experience_years,
        vp.services_offered, vp.service_area, vp.logo_url
      FROM vendor_shortlist sl
      JOIN users u ON sl.vendor_id = u.id
      JOIN vendor_profiles vp ON vp.user_id = u.id
      WHERE sl.customer_id = ?
      ORDER BY sl.created_at DESC
    `).bind(user.id).all()
    return c.json({ shortlist: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/shortlist - Add vendor to shortlist
shortlist.post('/', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const { vendor_id, notes } = await c.req.json()
    if (!vendor_id) return c.json({ error: 'vendor_id required' }, 400)
    
    const vendor = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND role = ?').bind(vendor_id, 'vendor').first()
    if (!vendor) return c.json({ error: 'Vendor not found' }, 404)

    await c.env.DB.prepare(
      'INSERT INTO vendor_shortlist (customer_id, vendor_id, notes) VALUES (?, ?, ?) ON CONFLICT (customer_id, vendor_id) DO UPDATE SET notes = EXCLUDED.notes'
    ).bind(user.id, vendor_id, notes || null).run()
    return c.json({ message: 'Vendor added to shortlist' }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// DELETE /api/shortlist/:vendorId - Remove from shortlist
shortlist.delete('/:vendorId', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const vendorId = c.req.param('vendorId')
    await c.env.DB.prepare('DELETE FROM vendor_shortlist WHERE customer_id = ? AND vendor_id = ?').bind(user.id, vendorId).run()
    return c.json({ message: 'Removed from shortlist' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/shortlist/check/:vendorId - Check if vendor is shortlisted
shortlist.get('/check/:vendorId', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const vendorId = c.req.param('vendorId')
    const result = await c.env.DB.prepare(
      'SELECT id FROM vendor_shortlist WHERE customer_id = ? AND vendor_id = ?'
    ).bind(user.id, vendorId).first()
    return c.json({ shortlisted: !!result })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default shortlist
