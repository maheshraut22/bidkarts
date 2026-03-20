// src/lib/db.ts - Database helpers (PostgreSQL version)
import { getDB, type DBClient } from './pg'

// Env interface - DB is now a PostgreSQL-compatible wrapper
export interface Env {
  DB: DBClient
  SENDGRID_API_KEY?: string
  SMTP_FROM?: string
}

export async function createNotification(
  db: DBClient,
  userId: number,
  title: string,
  message: string,
  type: string = 'info',
  relatedId?: number,
  relatedType?: string
) {
  try {
    await db.prepare(
      `INSERT INTO notifications (user_id, title, message, type, related_id, related_type) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(userId, title, message, type, relatedId || null, relatedType || null).run()
  } catch {}
}

export function paginate(page: number, limit: number) {
  const offset = (page - 1) * limit
  return { limit, offset }
}

export function sanitize(input: string): string {
  return input.replace(/[<>'"]/g, '').trim()
}

// Email notification templates
const emailTemplates: Record<string, (data: any) => { subject: string; html: string }> = {
  project_posted: (d) => ({
    subject: `Your project "${d.projectTitle}" is now live on BidKarts`,
    html: `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
      <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;font-size:24px;margin:0">🏗️ BidKarts</h1>
        <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px">Connect. Bid. Build.</p>
      </div>
      <div style="background:white;padding:32px;border-radius:0 0 12px 12px">
        <h2 style="color:#1e293b;margin-bottom:8px">Hi ${d.customerName}! 👋</h2>
        <p style="color:#64748b;font-size:15px;line-height:1.6">Your project has been successfully posted and is now live on BidKarts!</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0">
          <p style="font-weight:700;color:#16a34a;margin:0 0 8px">✅ Project Live: ${d.projectTitle}</p>
          <p style="color:#374151;font-size:14px;margin:0">Service: ${d.serviceType} | Location: ${d.location}</p>
        </div>
        <p style="color:#64748b;font-size:14px">Verified vendors in your area will start submitting bids shortly. You'll receive notifications for each bid received.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="https://bidkarts.pages.dev/projects/${d.projectId}" style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">View Your Project →</a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">BidKarts Technologies Pvt. Ltd. | Mumbai, India<br>You're receiving this because you posted a project on BidKarts.</p>
      </div>
    </div>`
  }),

  bid_received: (d) => ({
    subject: `New bid received for "${d.projectTitle}" from ${d.vendorName}`,
    html: `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
      <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;font-size:24px;margin:0">🏗️ BidKarts</h1>
      </div>
      <div style="background:white;padding:32px;border-radius:0 0 12px 12px">
        <h2 style="color:#1e293b">New Bid Received! 🎯</h2>
        <p style="color:#64748b;font-size:15px">Hi ${d.customerName}, you have received a new bid for your project.</p>
        <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:16px;margin:20px 0">
          <p style="font-weight:700;color:#2563eb;margin:0 0 8px">Project: ${d.projectTitle}</p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Vendor: <strong>${d.vendorName}</strong></p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Bid Amount: <strong>₹${d.bidAmount?.toLocaleString('en-IN')}</strong></p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Timeline: <strong>${d.timelineDays} days</strong></p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="https://bidkarts.pages.dev/projects/${d.projectId}" style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600">View All Bids →</a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">BidKarts Technologies Pvt. Ltd. | Mumbai, India</p>
      </div>
    </div>`
  }),

  bid_accepted: (d) => ({
    subject: `🎉 Congratulations! Your bid for "${d.projectTitle}" was accepted`,
    html: `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;font-size:24px;margin:0">🎉 Bid Accepted!</h1>
      </div>
      <div style="background:white;padding:32px;border-radius:0 0 12px 12px">
        <h2 style="color:#1e293b">Congratulations, ${d.vendorName}!</h2>
        <p style="color:#64748b;font-size:15px">Your bid has been accepted by the customer. The project is ready to proceed!</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0">
          <p style="font-weight:700;color:#16a34a;margin:0 0 8px">✅ ${d.projectTitle}</p>
          <p style="color:#374151;font-size:14px">You can now proceed to coordinate with the customer and begin work.</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="https://bidkarts.pages.dev/projects/${d.projectId}" style="background:linear-gradient(135deg,#059669,#047857);color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600">View Project →</a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">BidKarts Technologies Pvt. Ltd. | Mumbai, India</p>
      </div>
    </div>`
  }),

  bid_submitted: (d) => ({
    subject: `Bid submitted for "${d.projectTitle}" - BidKarts`,
    html: `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
      <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;font-size:24px;margin:0">📋 Bid Submitted</h1>
      </div>
      <div style="background:white;padding:32px;border-radius:0 0 12px 12px">
        <h2 style="color:#1e293b">Your Bid is Live! 🚀</h2>
        <p style="color:#64748b;font-size:15px">Hi ${d.vendorName}, your bid for the following project has been submitted successfully.</p>
        <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:10px;padding:16px;margin:20px 0">
          <p style="font-weight:700;color:#7c3aed;margin:0 0 8px">Project: ${d.projectTitle}</p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Your Bid: <strong>₹${d.bidAmount?.toLocaleString('en-IN')}</strong></p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Timeline: <strong>${d.timelineDays} days</strong></p>
        </div>
        <p style="color:#64748b;font-size:14px">You'll be notified once the customer reviews your bid. Good luck!</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">BidKarts Technologies Pvt. Ltd. | Mumbai, India</p>
      </div>
    </div>`
  }),

  inspection_requested: (d) => ({
    subject: `New Inspection Request - ${d.projectTitle}`,
    html: `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
      <div style="background:linear-gradient(135deg,#0891b2,#0284c7);padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;font-size:24px;margin:0">🔍 Inspection Requested</h1>
      </div>
      <div style="background:white;padding:32px;border-radius:0 0 12px 12px">
        <h2 style="color:#1e293b">New Inspection Request!</h2>
        <p style="color:#64748b;font-size:15px">Hi ${d.expertName || 'Expert'}, a new technical inspection has been requested.</p>
        <div style="background:#ecfeff;border:1px solid #67e8f9;border-radius:10px;padding:16px;margin:20px 0">
          <p style="font-weight:700;color:#0891b2;margin:0 0 8px">Project: ${d.projectTitle}</p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Location: ${d.location}</p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Inspection Fee: <strong>₹${d.fee?.toLocaleString('en-IN') || '1500'}</strong></p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="https://bidkarts.pages.dev/dashboard/expert" style="background:linear-gradient(135deg,#0891b2,#0284c7);color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600">Accept Inspection →</a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">BidKarts Technologies Pvt. Ltd. | Mumbai, India</p>
      </div>
    </div>`
  }),

  payment_success: (d) => ({
    subject: `Payment Confirmed - ₹${d.amount?.toLocaleString('en-IN')} for ${d.projectTitle}`,
    html: `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
      <div style="background:linear-gradient(135deg,#059669,#047857);padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;font-size:24px;margin:0">✅ Payment Confirmed</h1>
      </div>
      <div style="background:white;padding:32px;border-radius:0 0 12px 12px">
        <h2 style="color:#1e293b">Payment Successful! 💰</h2>
        <p style="color:#64748b;font-size:15px">Hi ${d.userName}, your payment has been processed successfully.</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0">
          <p style="font-weight:700;color:#16a34a;margin:0 0 8px">Amount: ₹${d.amount?.toLocaleString('en-IN')}</p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Project: ${d.projectTitle}</p>
          <p style="color:#374151;font-size:14px;margin:4px 0">Transaction ID: ${d.transactionId}</p>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">BidKarts Technologies Pvt. Ltd. | Mumbai, India</p>
      </div>
    </div>`
  }),

  password_reset: (d) => ({
    subject: `Reset your BidKarts password`,
    html: `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
      <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;font-size:24px;margin:0">🔐 BidKarts</h1>
      </div>
      <div style="background:white;padding:32px;border-radius:0 0 12px 12px">
        <h2 style="color:#1e293b">Password Reset Request</h2>
        <p style="color:#64748b;font-size:15px">Hi ${d.name}, we received a request to reset your password.</p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:16px;margin:20px 0">
          <p style="font-weight:700;color:#d97706;margin:0 0 8px">⏰ This link expires in 1 hour</p>
          <p style="color:#92400e;font-size:13px;margin:0">If you did not request this, please ignore this email.</p>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="https://bidkarts.pages.dev/reset-password?token=${d.token}" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600">Reset My Password →</a>
        </div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px">Or copy this link: https://bidkarts.pages.dev/reset-password?token=${d.token}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">BidKarts Technologies Pvt. Ltd. | Mumbai, India</p>
      </div>
    </div>`
  }),

  welcome: (d) => ({
    subject: `Welcome to BidKarts, ${d.name}! 🎉`,
    html: `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
      <div style="background:linear-gradient(135deg,#1e3a8a,#ea580c);padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;font-size:28px;margin:0">🏗️ BidKarts</h1>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">Connect. Bid. Build.</p>
      </div>
      <div style="background:white;padding:32px;border-radius:0 0 12px 12px">
        <h2 style="color:#1e293b">Welcome, ${d.name}! 🎉</h2>
        <p style="color:#64748b;font-size:15px;line-height:1.6">Thank you for joining BidKarts — India's premier marketplace for service contractors.</p>
        <div style="background:#eff6ff;border-radius:10px;padding:16px;margin:20px 0">
          <p style="font-weight:600;color:#2563eb;margin:0 0 8px">Your account is now active as: <strong style="text-transform:capitalize">${d.role}</strong></p>
          ${d.role === 'customer' ? `<p style="color:#374151;font-size:14px;margin:0">You can now post projects and receive competitive bids from verified contractors.</p>` : ''}
          ${d.role === 'vendor' ? `<p style="color:#374151;font-size:14px;margin:0">You can now browse projects and submit bids. Complete your profile to get more visibility.</p>` : ''}
          ${d.role === 'expert' ? `<p style="color:#374151;font-size:14px;margin:0">You can now accept inspection requests and provide technical recommendations.</p>` : ''}
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="https://bidkarts.pages.dev/" style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600">Get Started →</a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">BidKarts Technologies Pvt. Ltd. | Mumbai, India</p>
      </div>
    </div>`
  })
}

export interface EmailNotificationPayload {
  to: string
  subject: string
  template: string
  data: Record<string, any>
}

// Send email notification using Cloudflare Email Workers or log simulation
export async function sendEmailNotification(env: Env, payload: EmailNotificationPayload): Promise<void> {
  try {
    const tmpl = emailTemplates[payload.template]
    if (!tmpl) return

    const { html } = tmpl(payload.data)

    // If SendGrid API key is configured, send real emails
    if (env.SENDGRID_API_KEY) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: env.SMTP_FROM || 'noreply@bidkarts.com', name: 'BidKarts' },
          subject: payload.subject,
          content: [{ type: 'text/html', value: html }]
        })
      })

      if (!response.ok) {
        console.error('SendGrid error:', await response.text())
      }
      return
    }

    // Log for development/demo (email sending simulated)
    console.log(`[EMAIL SIMULATED] To: ${payload.to} | Subject: ${payload.subject} | Template: ${payload.template}`)
  } catch (e) {
    // Email notification failure should not break main flow
    console.error('Email notification error:', e)
  }
}
