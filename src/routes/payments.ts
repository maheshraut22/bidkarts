// src/routes/payments.ts - Payment routes with real Razorpay + Escrow support
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification, sendEmailNotification } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const payments = new Hono<{ Bindings: Env; Variables: Variables }>()

// ─── Helper: Razorpay HMAC-SHA256 signature verification ────────────────────
async function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  try {
    const body = `${orderId}|${paymentId}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const hex = Array.from(new Uint8Array(signatureBytes)).map(b => b.toString(16).padStart(2, '0')).join('')
    return hex === signature
  } catch {
    return false
  }
}

// ─── Helper: Create Razorpay order via REST API ─────────────────────────────
async function createRazorpayOrder(keyId: string, keySecret: string, amountPaise: number, currency: string, receipt: string, notes: Record<string, string> = {}) {
  const auth = btoa(`${keyId}:${keySecret}`)
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency, receipt, notes })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Razorpay order creation failed: ${err}`)
  }
  return res.json() as Promise<{ id: string; amount: number; currency: string; status: string }>
}

// GET /api/payments/my - Get user's payments
payments.get('/my', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const result = await c.env.DB.prepare(`
      SELECT pay.*, p.title as project_title, p.service_type
      FROM payments pay
      LEFT JOIN projects p ON pay.project_id = p.id
      WHERE pay.user_id = ?
      ORDER BY pay.created_at DESC
    `).bind(user.id).all()
    return c.json({ payments: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/payments/initiate - Initiate payment (real Razorpay or simulation)
payments.post('/initiate', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { project_id, inspection_id, milestone_id, payment_type, amount } = await c.req.json()
    if (!payment_type || !amount) return c.json({ error: 'Payment type and amount required' }, 400)
    if (amount <= 0) return c.json({ error: 'Invalid amount' }, 400)

    // Generate receipt
    const receipt = `bk_${payment_type.substring(0, 4)}_${Date.now()}`
    const amountPaise = Math.round(parseFloat(amount) * 100)

    let gatewayOrderId: string
    let isRealRazorpay = false
    const razorpayKeyId = (c.env as any).RAZORPAY_KEY_ID
    const razorpayKeySecret = (c.env as any).RAZORPAY_KEY_SECRET

    if (razorpayKeyId && razorpayKeySecret) {
      // Real Razorpay order
      const notes: Record<string, string> = { payment_type, user_id: String(user.id) }
      if (project_id) notes.project_id = String(project_id)
      const order = await createRazorpayOrder(razorpayKeyId, razorpayKeySecret, amountPaise, 'INR', receipt, notes)
      gatewayOrderId = order.id
      isRealRazorpay = true
    } else {
      // Simulated order for dev/testing
      gatewayOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO payments (user_id, project_id, inspection_id, milestone_id, payment_type, amount, currency, status, gateway, gateway_order_id, receipt)
      VALUES (?, ?, ?, ?, ?, ?, 'INR', 'pending', 'razorpay', ?, ?)
    `).bind(user.id, project_id || null, inspection_id || null, milestone_id || null, payment_type, parseFloat(amount), gatewayOrderId, receipt).run()

    return c.json({
      payment: {
        id: result.meta.last_row_id,
        gateway_order_id: gatewayOrderId,
        amount: amountPaise,
        currency: 'INR',
        key_id: razorpayKeyId || 'rzp_test_simulation',
        is_real: isRealRazorpay,
        name: 'BidKarts',
        description: payment_type === 'platform_fee' ? 'Platform Service Fee' :
          payment_type === 'inspection_fee' ? 'Technical Inspection Fee' :
          payment_type === 'milestone_payment' ? 'Milestone Payment (Escrow)' :
          payment_type === 'escrow_deposit' ? 'Escrow Deposit' : 'Vendor Advance Payment',
        prefill: { name: user.name, email: user.email, contact: user.phone || '' }
      }
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/payments/verify - Verify Razorpay payment
payments.post('/verify', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { payment_id, gateway_order_id, gateway_payment_id, razorpay_signature, payment_method = 'card' } = await c.req.json()
    if (!payment_id || !gateway_order_id) return c.json({ error: 'Payment ID required' }, 400)

    const razorpayKeySecret = (c.env as any).RAZORPAY_KEY_SECRET

    // Real signature verification if secret available
    if (razorpayKeySecret && razorpay_signature && gateway_payment_id) {
      const valid = await verifyRazorpaySignature(gateway_order_id, gateway_payment_id, razorpay_signature, razorpayKeySecret)
      if (!valid) return c.json({ error: 'Payment signature verification failed' }, 400)
    }

    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(7)}`

    await c.env.DB.prepare(`
      UPDATE payments SET status = 'completed', transaction_id = ?, gateway_payment_id = ?,
        payment_method = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(transactionId, gateway_payment_id || 'simulated', payment_method, payment_id, user.id).run()

    const payment = await c.env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(payment_id).first() as any

    // Post-payment actions
    if (payment?.payment_type === 'inspection_fee' && payment?.inspection_id) {
      await c.env.DB.prepare("UPDATE inspections SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payment.inspection_id).run()
    }

    if (payment?.payment_type === 'vendor_advance' && payment?.project_id) {
      await c.env.DB.prepare("UPDATE projects SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payment.project_id).run()
      // Notify vendor
      const proj = await c.env.DB.prepare('SELECT vendor_id, title FROM projects WHERE id = ?').bind(payment.project_id).first() as any
      if (proj?.vendor_id) {
        await createNotification(c.env.DB, proj.vendor_id, '💰 Payment Received!', `Advance payment received for project "${proj.title}". Work can now begin!`, 'payment', payment.project_id, 'project')
      }
    }

    if (payment?.payment_type === 'escrow_deposit' && payment?.project_id) {
      // Put funds in escrow
      await c.env.DB.prepare(`
        INSERT INTO escrow (project_id, customer_id, amount, status, payment_id)
        VALUES (?, ?, ?, 'held', ?)
        ON CONFLICT (project_id) DO UPDATE SET amount = EXCLUDED.amount, status = 'held', payment_id = EXCLUDED.payment_id
      `).bind(payment.project_id, user.id, payment.amount, payment_id).run()
      await c.env.DB.prepare("UPDATE projects SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payment.project_id).run()
      const proj = await c.env.DB.prepare('SELECT vendor_id, title FROM projects WHERE id = ?').bind(payment.project_id).first() as any
      if (proj?.vendor_id) {
        await createNotification(c.env.DB, proj.vendor_id, '🔐 Escrow Funded!', `Funds for "${proj.title}" are secured in escrow. You may begin work!`, 'payment', payment.project_id, 'project')
      }
    }

    if (payment?.payment_type === 'milestone_payment' && payment?.milestone_id) {
      await c.env.DB.prepare("UPDATE milestones SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payment.milestone_id).run()
      // Add to escrow for that milestone
      const milestone = await c.env.DB.prepare('SELECT * FROM milestones WHERE id = ?').bind(payment.milestone_id).first() as any
      if (milestone) {
        await c.env.DB.prepare(`
          INSERT INTO escrow (project_id, milestone_id, customer_id, amount, status, payment_id)
          VALUES (?, ?, ?, ?, 'held', ?)
        `).bind(milestone.project_id, payment.milestone_id, user.id, payment.amount, payment_id).run()
      }
    }

    // Notifications & email
    await createNotification(c.env.DB, user.id, '✅ Payment Successful', `Payment of ₹${payment?.amount?.toLocaleString('en-IN')} (TXN: ${transactionId}) completed.`, 'payment', payment_id, 'payment')

    // Get project title for email
    const projTitle = payment?.project_id
      ? (await c.env.DB.prepare('SELECT title FROM projects WHERE id = ?').bind(payment.project_id).first() as any)?.title || 'Project'
      : 'N/A'
    await sendEmailNotification(c.env, {
      to: user.email, subject: `Payment Confirmed - ₹${payment?.amount?.toLocaleString('en-IN')}`,
      template: 'payment_success',
      data: { userName: user.name, amount: payment?.amount, projectTitle: projTitle, transactionId }
    })

    return c.json({ message: 'Payment verified', transaction_id: transactionId, status: 'completed' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/payments/escrow/release - Release escrow funds to vendor (customer confirms)
payments.post('/escrow/release', authMiddleware, requireRole('customer'), async (c) => {
  try {
    const user = c.get('user')
    const { project_id, milestone_id } = await c.req.json()
    if (!project_id) return c.json({ error: 'project_id required' }, 400)

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND customer_id = ?').bind(project_id, user.id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    let escrowQuery = "SELECT * FROM escrow WHERE project_id = ? AND status = 'held'"
    let escrowParams: any[] = [project_id]
    if (milestone_id) { escrowQuery += ' AND milestone_id = ?'; escrowParams.push(milestone_id) }

    const escrow = await c.env.DB.prepare(escrowQuery).bind(...escrowParams).first() as any
    if (!escrow) return c.json({ error: 'No held escrow funds found' }, 404)

    // Release to vendor
    await c.env.DB.prepare("UPDATE escrow SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE id = ?").bind(escrow.id).run()

    if (milestone_id) {
      await c.env.DB.prepare("UPDATE milestones SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(milestone_id).run()
    }

    // Record vendor credit transaction
    await c.env.DB.prepare(`
      INSERT INTO payments (user_id, project_id, milestone_id, payment_type, amount, currency, status, gateway, transaction_id, notes)
      VALUES (?, ?, ?, 'escrow_release', ?, 'INR', 'completed', 'internal', ?, 'Escrow funds released to vendor')
    `).bind(project.vendor_id, project_id, milestone_id || null, escrow.amount, `rel_${Date.now()}`).run()

    if (project.vendor_id) {
      await createNotification(c.env.DB, project.vendor_id, '💸 Payment Released!', `₹${escrow.amount?.toLocaleString('en-IN')} from escrow has been released for project "${project.title}".`, 'payment', project_id, 'project')
    }

    // Check if all milestones done → mark project complete
    if (milestone_id) {
      const remaining = await c.env.DB.prepare(
        "SELECT COUNT(*) as cnt FROM milestones WHERE project_id = ? AND status NOT IN ('approved','paid')"
      ).bind(project_id).first() as any
      if (remaining?.cnt === 0) {
        await c.env.DB.prepare("UPDATE projects SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(project_id).run()
        await createNotification(c.env.DB, user.id, '🎉 Project Complete!', `Project "${project.title}" has been marked as complete.`, 'project', project_id, 'project')
      }
    }

    return c.json({ message: `₹${escrow.amount?.toLocaleString('en-IN')} released to vendor successfully` })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/payments/escrow/refund - Refund escrow to customer (admin only / dispute)
payments.post('/escrow/refund', authMiddleware, requireRole('admin'), async (c) => {
  try {
    const { project_id, reason } = await c.req.json()
    if (!project_id) return c.json({ error: 'project_id required' }, 400)

    const escrow = await c.env.DB.prepare("SELECT * FROM escrow WHERE project_id = ? AND status = 'held'").bind(project_id).first() as any
    if (!escrow) return c.json({ error: 'No held escrow found' }, 404)

    await c.env.DB.prepare("UPDATE escrow SET status = 'refunded', released_at = CURRENT_TIMESTAMP, notes = ? WHERE id = ?").bind(reason || 'Admin refund', escrow.id).run()
    await createNotification(c.env.DB, escrow.customer_id, '↩️ Escrow Refunded', `₹${escrow.amount?.toLocaleString('en-IN')} has been refunded to you.${reason ? ' Reason: ' + reason : ''}`, 'payment', project_id, 'project')
    return c.json({ message: 'Escrow refunded to customer' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/payments/escrow/:projectId - Get escrow status for a project
payments.get('/escrow/:projectId', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('projectId')
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first() as any
    if (!project) return c.json({ error: 'Not found' }, 404)
    if (user.role === 'customer' && project.customer_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
    if (user.role === 'vendor' && project.vendor_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

    const escrowList = await c.env.DB.prepare(`
      SELECT e.*, m.title as milestone_title
      FROM escrow e LEFT JOIN milestones m ON e.milestone_id = m.id
      WHERE e.project_id = ?
      ORDER BY e.created_at DESC
    `).bind(projectId).all()
    const summary = await c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END) as held,
        SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END) as released,
        SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as refunded
      FROM escrow WHERE project_id = ?
    `).bind(projectId).first()
    return c.json({ escrow: escrowList.results, summary })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// GET /api/payments/stats - Payment stats
payments.get('/stats', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const clause = user.role === 'admin' ? '' : 'WHERE user_id = ?'
    const params = user.role === 'admin' ? [] : [user.id]
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN payment_type = 'platform_fee' THEN 1 END) as platform_fees,
        COUNT(CASE WHEN payment_type = 'inspection_fee' THEN 1 END) as inspection_fees,
        COUNT(CASE WHEN payment_type IN ('vendor_advance','escrow_deposit') THEN 1 END) as vendor_payments
      FROM payments ${clause}
    `).bind(...params).first()
    return c.json({ stats })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/payments/gst-invoice/:paymentId - Generate GST invoice data
payments.get('/gst-invoice/:paymentId', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const paymentId = c.req.param('paymentId')
    const payment = await c.env.DB.prepare(`
      SELECT pay.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
        u.address as user_address, p.title as project_title, p.service_type
      FROM payments pay
      JOIN users u ON pay.user_id = u.id
      LEFT JOIN projects p ON pay.project_id = p.id
      WHERE pay.id = ? AND (pay.user_id = ? OR ? = 'admin')
    `).bind(paymentId, user.id, user.role).first() as any
    if (!payment) return c.json({ error: 'Payment not found' }, 404)

    const baseAmount = payment.amount
    const gstRate = 0.18 // 18% GST
    const gstAmount = Math.round(baseAmount * gstRate)
    const totalAmount = baseAmount + gstAmount

    const invoice = {
      invoice_number: `BK-INV-${payment.id}-${new Date().getFullYear()}`,
      invoice_date: new Date().toISOString().split('T')[0],
      gstin: 'BK27AABCU9603R1ZM', // Demo GSTIN
      hsn_code: '998313', // IT/Platform services HSN
      service_description: payment.payment_type === 'platform_fee' ? 'Platform Facilitation Services' :
        payment.payment_type === 'inspection_fee' ? 'Technical Inspection Services' : 'Marketplace Transaction Fee',
      customer_name: payment.user_name,
      customer_email: payment.user_email,
      customer_phone: payment.user_phone,
      customer_address: payment.user_address || 'India',
      project_title: payment.project_title,
      base_amount: baseAmount,
      cgst: Math.round(gstAmount / 2),
      sgst: Math.round(gstAmount / 2),
      igst: 0,
      total_gst: gstAmount,
      total_amount: totalAmount,
      transaction_id: payment.transaction_id,
      payment_method: payment.payment_method || 'Online',
      currency: 'INR'
    }
    return c.json({ invoice })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default payments
