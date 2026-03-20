# BidKarts – Production-Ready EPC & Contractor Marketplace

## Platform Overview
**BidKarts** is India's premier marketplace connecting **Customers** with **Verified Vendors** for EPC and contractor services, with **Expert Technical Consultations** and an AI-powered project intelligence layer.

- **Platform URL**: https://3000-ib0jvtyl5dvdm3146xbcz-a402f90a.sandbox.novita.ai
- **Version**: 3.0.0 (Production-Ready)
- **Tech Stack**: Hono + TypeScript + Cloudflare D1 + Vanilla JS SPA

---

## ✅ Live Features

### 🏠 Public Pages
| Feature | URL | Description |
|---------|-----|-------------|
| Home | `/` | Hero, live ticker, services, how-it-works, featured projects, testimonials |
| Projects | `/projects` | Browse with search, filter, sort |
| Vendors | `/vendors` | Browse verified contractors |
| **AI Tools** | `/ai-tools` | Cost estimator, vendor recommender, spec generator |
| **Expert Consultations** | `/consultations` | Browse & book certified experts |
| How It Works | `/how-it-works` | Platform guide |
| About | `/about` | Platform info |
| SEO Pages | `/services/solar`, `/services/electrical`, etc | City-based SEO landing pages |

### 👤 Authentication
- Email/Password login with JWT
- Role-based: Customer, Vendor, Expert, Admin
- Demo accounts: `admin@bidkarts.com` / `vendor@bidkarts.com` / `customer@bidkarts.com` / `expert@bidkarts.com` (password: `Admin@123`)
- Forgot/Reset password flow

### 🏗️ Customer Features
- Post projects (multi-step wizard: info, budget, dates, documents, review)
- Dashboard: Projects, Bids, Milestones, Payments, Messages, Notifications
- **Vendor Shortlist** – Save favourite vendors with heart button
- Bid comparison (side-by-side with Chart.js)
- **Reverse Auction View** – Real-time bid ranking with countdown
- **AI Recommendations** – AI-scored vendors for any project
- Accept bids, release escrow, rate vendors
- Book expert consultations
- **Raise Disputes** – Full dispute workflow with admin resolution

### 🏢 Vendor Features
- Verified signup with company details, service selection
- Browse open projects with advanced filters
- Submit competitive bids with equipment/warranty details
- Dashboard: Overview, Projects, Bids, Portfolio, Analytics, Plans, Won Projects
- Subscription plans: Free / Pro (₹2,999) / Premium (₹5,999)
- Win rate analytics, bid status charts

### 🎓 Expert Features
- Technical inspection booking and management
- **Consultation Booking** – Accept/schedule sessions with video links
- Dashboard: Overview, Inspections, **Consultations**, Earnings
- Upload reports and recommendations
- Earnings tracking (₹1,500+/consultation)

### 🛡️ Admin Panel
- Full user management (activate/deactivate)
- Vendor approval workflow
- Project moderation
- Payment monitoring
- Analytics (doughnut + bar charts)
- **Dispute Resolution** – Resolve with winner assignment and refund
- **Top Vendors Analytics** – Ranked vendor management + CSV export

---

## 🤖 AI Features

### 1. Cost Estimator (`/api/ai/estimate`)
- **6 service types**: Solar, Electrical, HVAC, Plumbing, Fabrication, Contracting
- Returns: estimate range (min/max), materials list, tips, timeline, ROI
- Location-aware pricing (15% metro multiplier)
- GST guidance included

### 2. Vendor Recommender (`/api/ai/recommend`)
- ML-style scoring: rating (15pts) + reviews + experience + projects + win rate + location match
- Top 5 vendors with match reasons and scores
- Accessible directly from bid comparison page

### 3. Spec Generator (`/api/ai/spec-generator`)
- Full technical scope of work
- Compliance standards (IS codes, BIS, MNRE, CEA)
- Material lists, technical specs, deliverables
- Print/Save support

---

## 💬 Consultation System

- Browse certified experts by service type and location
- Book by topic, preferred date/time, mode (Video/Phone/Site Visit)
- Experts: Accept → Schedule (with video link) → Complete (report + recommendations)
- Full booking history for both customers and experts
- Fee: ₹1,500/hr (default, configurable per expert)

---

## ⚖️ Dispute Resolution

- Customers and vendors can raise disputes with reason + description
- Both parties can respond before admin decision
- Admin resolves: winner, resolution text, refund amount
- Notifications sent to all parties

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| users | All users (customer/vendor/expert/admin) |
| vendor_profiles | Vendor company info, GST, PAN, certifications |
| expert_profiles | Expert specialization, hourly rate, availability |
| projects | Posted projects with budget, timeline, status |
| bids | Vendor bids with amount, timeline, warranty |
| milestones | Project payment milestones |
| escrow | Escrow holdings per milestone |
| payments | All transactions (Razorpay/Stripe/UPI) |
| messages | Chat messages in conversations |
| conversations | Customer-vendor/expert chat threads |
| notifications | In-app notifications |
| reviews | Star ratings and comments |
| documents | Attached project documents |
| inspections | Technical site inspections |
| **consultations** | Expert consultation bookings |
| **disputes** | Dispute cases with resolution |
| **vendor_shortlist** | Customer's saved vendors |
| consultation_slots | Expert availability calendar |
| referrals | Referral tracking |

---

## 🌐 API Endpoints

### Public APIs (No Auth)
```
GET  /api/health            → Status check
GET  /api/stats/public      → Platform stats
GET  /api/projects          → Browse projects
GET  /api/users/vendors     → Browse vendors
GET  /api/ai/estimate       → AI cost estimate
GET  /api/ai/spec-generator → AI project spec
GET  /api/consultations/experts → Browse experts
```

### Authenticated APIs
```
POST /api/auth/login|register
GET  /api/bids/project/:id     → Project bids
GET  /api/consultations        → My consultations
POST /api/consultations        → Book consultation
GET  /api/disputes             → My disputes
POST /api/disputes             → Raise dispute
GET  /api/shortlist            → My shortlisted vendors
POST /api/shortlist            → Add to shortlist
GET  /api/ai/recommend         → Vendor recommendations
GET  /api/milestones/project/:id
POST /api/messages/send
...
```

---

## 💰 Revenue Model
- **Platform Commission**: 5-10% on completed project payments
- **Vendor Subscriptions**: Free / Pro ₹2,999/mo / Premium ₹5,999/mo
- **Inspection Fees**: ₹1,500 per technical inspection
- **Consultation Fees**: ₹1,500/hr (platform takes 15% cut)
- **Lead Credits**: Vendors purchase leads for targeted projects

---

## 🚀 Deployment

### Development (Sandbox)
```bash
npm run build
pm2 start ecosystem.config.cjs
# URL: http://localhost:3000
```

### Production (Cloudflare Pages)
```bash
npx wrangler d1 create bidkarts-production
# Update wrangler.jsonc with database_id
npx wrangler d1 migrations apply bidkarts-production
npm run deploy
# Visit: https://your-project.pages.dev/api/setup (run once)
```

---

## 📊 Platform Stats (Live Demo)
- 50+ demo projects across all categories
- 2 verified vendors (Singh Tech Solutions, Kumar Constructions)
- 1 expert (Dr. Priya Patel)
- 2 customers (demo accounts)

---

*Last Updated: March 2026 | BidKarts Technologies Pvt. Ltd.*
