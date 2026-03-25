// src/index.tsx - Main BidKarts Application Entry Point
// Works with BOTH Cloudflare Workers (D1 binding) AND Node.js (PostgreSQL)
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import authRoutes from './routes/auth'
import projectRoutes from './routes/projects'
import bidRoutes from './routes/bids'
import userRoutes from './routes/users'
import inspectionRoutes from './routes/inspections'
import paymentRoutes from './routes/payments'
import adminRoutes from './routes/admin'
import documentRoutes from './routes/documents'
import messageRoutes from './routes/messages'
import milestoneRoutes from './routes/milestones'
import aiRoutes from './routes/ai'
import consultationRoutes from './routes/consultations'
import disputeRoutes from './routes/disputes'
import shortlistRoutes from './routes/shortlist'
import type { Env } from './lib/db'

const app = new Hono<{ Bindings: Env }>()

// ── Rate Limiter (in-memory) ─────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

// ── DB injection: only inject PostgreSQL when NOT running in Cloudflare Workers ─
// When running via wrangler pages dev, c.env.DB is already set by the D1 binding.
// When running via Node.js server (server.ts), c.env.DB is undefined → inject pg.
app.use('*', async (c, next) => {
  if (!c.env?.DB) {
    // Node.js / AWS mode: inject PostgreSQL
    try {
      const { getDB } = await import('./lib/pg')
      // @ts-ignore
      c.env = c.env || {}
      // @ts-ignore
      c.env.DB = getDB()
    } catch (e) {
      console.error('[DB] Failed to load PostgreSQL:', e)
    }
  }
  // Inject env vars from process.env (Node.js) or Cloudflare bindings (Workers)
  if (typeof process !== 'undefined' && process.env) {
    // @ts-ignore
    if (!c.env.SENDGRID_API_KEY) c.env.SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
    // @ts-ignore
    if (!c.env.SMTP_FROM) c.env.SMTP_FROM = process.env.SMTP_FROM
  }
  await next()
})

// Logging
app.use('*', logger())

// CORS
app.use('/api/*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// Rate limits on auth endpoints
app.use('/api/auth/login', async (c, next) => {
  const ip = c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown'
  if (!rateLimit(`auth_login_${ip}`, 20, 15 * 60 * 1000)) {
    return c.json({ error: 'Too many login attempts. Please wait 15 minutes.' }, 429)
  }
  await next()
})
app.use('/api/auth/register', async (c, next) => {
  const ip = c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown'
  if (!rateLimit(`auth_register_${ip}`, 10, 60 * 60 * 1000)) {
    return c.json({ error: 'Too many registration attempts. Please try again later.' }, 429)
  }
  await next()
})
app.use('/api/users/forgot-password', async (c, next) => {
  const ip = c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown'
  if (!rateLimit(`pw_reset_${ip}`, 5, 60 * 60 * 1000)) {
    return c.json({ error: 'Too many password reset requests. Try again in 1 hour.' }, 429)
  }
  await next()
})

// API Routes
app.route('/api/auth', authRoutes)
app.route('/api/projects', projectRoutes)
app.route('/api/bids', bidRoutes)
app.route('/api/users', userRoutes)
app.route('/api/inspections', inspectionRoutes)
app.route('/api/payments', paymentRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/documents', documentRoutes)
app.route('/api/messages', messageRoutes)
app.route('/api/milestones', milestoneRoutes)
app.route('/api/ai', aiRoutes)
app.route('/api/consultations', consultationRoutes)
app.route('/api/disputes', disputeRoutes)
app.route('/api/shortlist', shortlistRoutes)

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', platform: 'BidKarts', version: '2.0.0', time: new Date().toISOString() }))

// Public platform stats
app.get('/api/stats/public', async (c) => {
  try {
    const db = c.env.DB
    const [projRow, vendorRow, completedRow] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM projects').first<{cnt:number}>(),
      db.prepare("SELECT COUNT(*) as cnt FROM vendor_profiles WHERE is_approved=1").first<{cnt:number}>(),
      db.prepare("SELECT COUNT(*) as cnt FROM projects WHERE status='completed'").first<{cnt:number}>(),
    ])
    return c.json({
      total_projects: projRow?.cnt || 0,
      verified_vendors: vendorRow?.cnt || 0,
      completed_projects: completedRow?.cnt || 0,
    })
  } catch { return c.json({ total_projects: 2500, verified_vendors: 850, completed_projects: 15000 }) }
})

// DB Setup/Seed endpoint (run once after deploy: GET /api/setup)
app.get('/api/setup', async (c) => {
  try {
    const db = c.env.DB

    // Create all tables (PostgreSQL syntax)
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','vendor','expert','admin')),
        address TEXT,
        is_verified INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        avatar_url TEXT,
        reset_token TEXT,
        reset_token_expiry TIMESTAMP,
        referral_code TEXT UNIQUE,
        subscription_plan TEXT DEFAULT 'free',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS vendor_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        company_name TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        service_area TEXT,
        certifications TEXT,
        experience_years INTEGER DEFAULT 0,
        services_offered TEXT,
        is_approved INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0,
        rating NUMERIC DEFAULT 0,
        total_reviews INTEGER DEFAULT 0,
        total_projects INTEGER DEFAULT 0,
        description TEXT,
        website TEXT,
        logo_url TEXT,
        portfolio_images TEXT,
        specializations TEXT,
        subscription_plan TEXT DEFAULT 'free',
        gst_number TEXT,
        pan_number TEXT,
        response_time_hours INTEGER DEFAULT 24,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS expert_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        certification TEXT,
        experience INTEGER DEFAULT 0,
        service_area TEXT,
        specialization TEXT,
        is_approved INTEGER DEFAULT 0,
        rating NUMERIC DEFAULT 0,
        total_inspections INTEGER DEFAULT 0,
        bio TEXT,
        expertise_area TEXT,
        hourly_rate NUMERIC DEFAULT 1500,
        is_available INTEGER DEFAULT 1,
        location TEXT,
        service_types TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES users(id),
        vendor_id INTEGER REFERENCES users(id),
        service_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT NOT NULL,
        property_type TEXT,
        budget_min NUMERIC,
        budget_max NUMERIC,
        timeline TEXT,
        bid_opening_date TIMESTAMP,
        bid_closing_date TIMESTAMP,
        expert_support INTEGER DEFAULT 0,
        status TEXT DEFAULT 'open',
        selected_vendor_id INTEGER REFERENCES users(id),
        completion_note TEXT,
        inspection_required INTEGER DEFAULT 0,
        admin_note TEXT,
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS bids (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        vendor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bid_amount NUMERIC NOT NULL,
        timeline_days INTEGER NOT NULL,
        equipment_details TEXT,
        warranty_details TEXT,
        message TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, vendor_id)
      )`,
      `CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        doc_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        s3_key TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS inspections (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        customer_id INTEGER NOT NULL REFERENCES users(id),
        expert_id INTEGER REFERENCES users(id),
        status TEXT DEFAULT 'requested',
        visit_date TIMESTAMP,
        scheduled_at TIMESTAMP,
        report_url TEXT,
        recommendation TEXT,
        notes TEXT,
        fee NUMERIC DEFAULT 1500,
        rating INTEGER,
        review TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        project_id INTEGER REFERENCES projects(id),
        inspection_id INTEGER,
        milestone_id INTEGER,
        payment_type TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'pending',
        gateway TEXT DEFAULT 'razorpay',
        transaction_id TEXT,
        gateway_order_id TEXT,
        gateway_payment_id TEXT,
        payment_method TEXT,
        receipt TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS escrow (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        milestone_id INTEGER,
        customer_id INTEGER NOT NULL REFERENCES users(id),
        amount NUMERIC NOT NULL,
        status TEXT DEFAULT 'held' CHECK(status IN ('held','released','refunded')),
        payment_id INTEGER,
        notes TEXT,
        released_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS milestones (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        due_date DATE,
        amount NUMERIC,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','approved','paid')),
        sort_order INTEGER DEFAULT 0,
        completion_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        related_id INTEGER,
        related_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        reviewer_id INTEGER NOT NULL REFERENCES users(id),
        vendor_id INTEGER NOT NULL REFERENCES users(id),
        rating INTEGER NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, reviewer_id)
      )`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        customer_id INTEGER NOT NULL REFERENCES users(id),
        vendor_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, customer_id, vendor_id)
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT,
        attachment_url TEXT,
        attachment_name TEXT,
        is_read INTEGER DEFAULT 0,
        is_flagged INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id INTEGER NOT NULL REFERENCES users(id),
        referred_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
        status TEXT DEFAULT 'applied',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES users(id),
        expert_id INTEGER NOT NULL REFERENCES users(id),
        project_id INTEGER REFERENCES projects(id),
        service_type TEXT NOT NULL,
        topic TEXT NOT NULL,
        description TEXT,
        preferred_date DATE,
        preferred_time TEXT,
        scheduled_date TEXT,
        scheduled_time TEXT,
        consultation_type TEXT DEFAULT 'video',
        fee NUMERIC DEFAULT 1500,
        status TEXT DEFAULT 'requested',
        video_link TEXT,
        expert_notes TEXT,
        customer_notes TEXT,
        report_url TEXT,
        recommendations TEXT,
        summary TEXT,
        rating INTEGER,
        review TEXT,
        completed_at TIMESTAMP,
        location TEXT,
        attachments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS disputes (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        customer_id INTEGER NOT NULL REFERENCES users(id),
        vendor_id INTEGER REFERENCES users(id),
        raised_by INTEGER NOT NULL REFERENCES users(id),
        reason TEXT NOT NULL,
        description TEXT NOT NULL,
        evidence_urls TEXT,
        customer_response TEXT,
        vendor_response TEXT,
        status TEXT DEFAULT 'open',
        resolution TEXT,
        winner TEXT,
        refund_amount NUMERIC DEFAULT 0,
        admin_notes TEXT,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS vendor_shortlist (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES users(id),
        vendor_id INTEGER NOT NULL REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(customer_id, vendor_id)
      )`,
      `CREATE TABLE IF NOT EXISTS consultation_slots (
        id SERIAL PRIMARY KEY,
        expert_id INTEGER NOT NULL REFERENCES users(id),
        slot_date DATE NOT NULL,
        slot_time TEXT NOT NULL,
        duration_mins INTEGER DEFAULT 60,
        is_booked INTEGER DEFAULT 0,
        consultation_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS ai_responses (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        is_approved INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS subscription_transactions (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES users(id),
        plan TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        status TEXT DEFAULT 'completed',
        gateway_order_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    ]

    for (const stmt of tables) {
      await db.prepare(stmt).run()
    }

    // Seed demo users
    const { hashPassword } = await import('./lib/auth')
    const adminHash = await hashPassword('Admin@123')
    const customerHash = adminHash
    const vendorHash = adminHash
    const expertHash = adminHash

    const seedUsers = [
      ['Admin User', 'admin@bidkarts.com', '9999999999', adminHash, 'admin'],
      ['Rahul Sharma', 'customer@bidkarts.com', '9876543210', customerHash, 'customer'],
      ['Vikram Singh', 'vendor@bidkarts.com', '9123456789', vendorHash, 'vendor'],
      ['Dr. Priya Patel', 'expert@bidkarts.com', '9988776655', expertHash, 'expert'],
      ['Amit Kumar', 'amit@bidkarts.com', '9871234567', vendorHash, 'vendor'],
      ['Sunita Verma', 'sunita@bidkarts.com', '9865432107', customerHash, 'customer'],
    ]
    for (const [name, email, phone, hash, role] of seedUsers) {
      const code = `BK${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      await db.prepare(
        `INSERT INTO users (name,email,phone,password_hash,role,is_verified,is_active,referral_code)
         VALUES (?,?,?,?,?,1,1,?) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash, is_verified=1, is_active=1`
      ).bind(name, email, phone, hash, role, code).run()
    }

    const vendorUser  = await db.prepare('SELECT id FROM users WHERE email=?').bind('vendor@bidkarts.com').first() as any
    const expertUser  = await db.prepare('SELECT id FROM users WHERE email=?').bind('expert@bidkarts.com').first() as any
    const amitUser    = await db.prepare('SELECT id FROM users WHERE email=?').bind('amit@bidkarts.com').first() as any
    const customerUser = await db.prepare('SELECT id FROM users WHERE email=?').bind('customer@bidkarts.com').first() as any
    const sunitaUser  = await db.prepare('SELECT id FROM users WHERE email=?').bind('sunita@bidkarts.com').first() as any

    if (vendorUser) {
      await db.prepare(`INSERT INTO vendor_profiles (user_id,company_name,owner_name,service_area,certifications,experience_years,services_offered,is_approved,rating,total_reviews,total_projects,description,specializations,subscription_plan)
        VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,'pro') ON CONFLICT(user_id) DO UPDATE SET is_approved=1,rating=4.7`)
        .bind(vendorUser.id,'Singh Tech Solutions','Vikram Singh','Mumbai, Pune, Nashik','ISO 9001, MNRE Certified',8,'hvac,electrical,solar',4.7,45,23,'Premium electrical and solar EPC services.','Solar EPC, Electrical').run()
    }
    if (amitUser) {
      await db.prepare(`INSERT INTO vendor_profiles (user_id,company_name,owner_name,service_area,certifications,experience_years,services_offered,is_approved,rating,total_reviews,total_projects,description,specializations)
        VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET is_approved=1,rating=4.5`)
        .bind(amitUser.id,'Kumar Constructions','Amit Kumar','Delhi, Noida, Gurgaon','ISO 14001, CPWD Approved',12,'plumbing,fabrication,contracting',4.5,67,38,'Full-service construction firm.','Structural, MEP').run()
    }
    if (expertUser) {
      await db.prepare(`INSERT INTO expert_profiles (user_id,certification,experience,service_area,specialization,is_approved,rating,total_inspections,bio)
        VALUES (?,?,?,?,?,1,?,?,?) ON CONFLICT(user_id) DO UPDATE SET is_approved=1`)
        .bind(expertUser.id,'Licensed Electrical Engineer, PMP',10,'Mumbai, Thane','Solar EPC, Electrical Safety, HVAC',4.9,89,'Certified expert with 10+ years experience.').run()
    }

    if (customerUser && sunitaUser) {
      const now = new Date()
      const future = new Date(now.getTime() + 30*24*60*60*1000)
      const projectSeeds = [
        [customerUser.id,'solar','Rooftop Solar Installation - 5kW','Need 5kW solar for residential, complete EPC with net metering.','Mumbai, Andheri West','Residential',250000,350000,'30 days'],
        [customerUser.id,'electrical','Complete House Rewiring - 3BHK','Old house needs complete rewiring with MCB panels.','Mumbai, Bandra','Residential',80000,120000,'15 days'],
        [sunitaUser.id,'hvac','Central AC Installation for Office','2000 sq ft office needs VRF HVAC system.','Pune, Koregaon Park','Commercial',180000,280000,'20 days'],
        [sunitaUser.id,'plumbing','Bathroom Renovation Plumbing','2 bathrooms renovation with new pipes and fixtures.','Mumbai, Powai','Residential',60000,90000,'10 days'],
        [customerUser.id,'fabrication','MS Fabrication for Industrial Shed','5000 sq ft MS structural fabrication.','Navi Mumbai, Taloja MIDC','Industrial',500000,800000,'45 days'],
      ]
      for (const [cid,stype,title,desc,loc,ptype,bmin,bmax,tl] of projectSeeds) {
        await db.prepare(`INSERT INTO projects (customer_id,service_type,title,description,location,property_type,budget_min,budget_max,timeline,status,bid_opening_date,bid_closing_date)
          VALUES (?,?,?,?,?,?,?,?,?,'open',?,?) ON CONFLICT (id) DO NOTHING`)
          .bind(cid,stype,title,desc,loc,ptype,bmin,bmax,tl,now.toISOString(),future.toISOString()).run()
      }
      const proj1 = await db.prepare("SELECT id FROM projects WHERE service_type='solar' LIMIT 1").first() as any
      if (proj1 && vendorUser) {
        await db.prepare(`INSERT INTO bids (project_id,vendor_id,bid_amount,timeline_days,equipment_details,warranty_details,message,status)
          VALUES (?,?,?,?,?,?,?,'pending') ON CONFLICT (project_id, vendor_id) DO NOTHING`)
          .bind(proj1.id,vendorUser.id,285000,28,'Adani Solar 540W Panels x10, Growatt 5kW Inverter','5 Year Panel, 2 Year Install Warranty','Specialise in solar EPC with 8+ years.').run()
        await db.prepare("UPDATE projects SET status='bidding' WHERE id=?").bind(proj1.id).run()
      }
    }

    return c.json({ message: 'Database setup and seeded successfully!', status: 'ok' })
  } catch (e: any) {
    return c.json({ error: e.message, stack: e.stack }, 500)
  }
})

// Serve static files (frontend JS/CSS)
// Static files in public/ are served automatically by Cloudflare Pages.
// For Node.js/AWS mode, static serving is handled in server.ts.

// SPA fallback - serve index.html for all non-API routes
app.get('*', async (c) => c.html(generateHTML()))

function generateHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>BidKarts - Connect. Bid. Build.</title>
  <meta name="description" content="India's premier marketplace for HVAC, Electrical, Plumbing, Solar, Fabrication, and Contracting services." />
  <link rel="manifest" href="/static/manifest.json" />
  <meta name="theme-color" content="#2563eb" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
    tailwind.config = {
      theme: { extend: {
        colors: {
          primary:{50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a'},
          accent:{50:'#fff7ed',100:'#ffedd5',500:'#f97316',600:'#ea580c',700:'#c2410c'}
        },
        fontFamily:{sans:['Inter','system-ui','sans-serif']}
      }}
    }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#f8fafc;color:#1e293b}
    .gradient-hero{background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 40%,#2563eb 70%,#ea580c 100%)}
    .card-hover{transition:all 0.3s ease;cursor:pointer}
    .card-hover:hover{transform:translateY(-4px);box-shadow:0 20px 40px rgba(0,0,0,0.12)}
    .btn-primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);transition:all 0.2s;border:none;cursor:pointer}
    .btn-primary:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(37,99,235,0.4)}
    .btn-accent{background:linear-gradient(135deg,#f97316,#ea580c);transition:all 0.2s;border:none;cursor:pointer}
    .btn-accent:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(249,115,22,0.4)}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
    .modal-box{background:white;border-radius:16px;padding:32px;max-width:560px;width:90%;max-height:90vh;overflow-y:auto;animation:slideIn 0.3s ease}
    @keyframes slideIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}
    .sidebar-nav a,.sidebar-nav button{display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:8px;color:#475569;font-size:14px;font-weight:500;transition:all 0.2s;text-decoration:none;cursor:pointer;width:100%;border:none;background:none;text-align:left}
    .sidebar-nav a:hover,.sidebar-nav button:hover{background:#eff6ff;color:#2563eb}
    .sidebar-nav a.active,.sidebar-nav button.active{background:#dbeafe;color:#2563eb;font-weight:600}
    .toast{position:fixed;top:80px;right:20px;z-index:9999;padding:14px 20px;border-radius:12px;font-size:14px;font-weight:500;animation:toastIn 0.3s ease;max-width:380px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.15)}
    @keyframes toastIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
    .progress-bar{height:8px;border-radius:4px;background:#e2e8f0;overflow:hidden}
    .progress-fill{height:100%;border-radius:4px;transition:width 0.5s ease}
    .stat-card{background:white;border-radius:16px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.05),0 4px 12px rgba(0,0,0,0.04)}
    .form-input{width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;transition:all 0.2s;outline:none;background:white}
    .form-input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
    .form-label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
    .nav-link{color:#475569;font-size:14px;font-weight:500;transition:color 0.2s;text-decoration:none;cursor:pointer}
    .nav-link:hover{color:#2563eb}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:#f1f5f9}
    ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
    ::-webkit-scrollbar-thumb:hover{background:#94a3b8}
    .loading-spinner{width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .fade-in{animation:fadeIn 0.4s ease}
    @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .chat-bubble-out{background:#2563eb;color:white;border-radius:16px 16px 4px 16px;padding:10px 14px;max-width:70%;word-break:break-word}
    .chat-bubble-in{background:#f1f5f9;color:#1e293b;border-radius:16px 16px 16px 4px;padding:10px 14px;max-width:70%;word-break:break-word}
    .milestone-card{background:white;border-radius:12px;padding:16px;border:1.5px solid #e2e8f0;transition:border-color 0.2s}
    .milestone-card.pending{border-left:4px solid #94a3b8}
    .milestone-card.in_progress{border-left:4px solid #f59e0b}
    .milestone-card.completed{border-left:4px solid #3b82f6}
    .milestone-card.approved,.milestone-card.paid{border-left:4px solid #10b981}
    .status-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:capitalize}
    .service-icon-wrap{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px}
    @keyframes shimmer{0%{background-color:#f1f5f9}50%{background-color:#e2e8f0}100%{background-color:#f1f5f9}}
    @keyframes tickerScrollAnim{0%{transform:translateX(0) translateY(-50%)}100%{transform:translateX(-50%) translateY(-50%)}}
    @keyframes pulseAnim{0%,100%{opacity:1}50%{opacity:0.4}}
  </style>
</head>
<body>
<div id="app">
  <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px">
    <div class="loading-spinner"></div>
    <p style="color:#64748b;font-size:14px">Loading BidKarts...</p>
  </div>
</div>
<script src="/static/app.js"></script>
</body>
</html>`
}

export default app
