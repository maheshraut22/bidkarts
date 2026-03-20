-- =============================================================================
-- BidKarts PostgreSQL Schema Migration
-- File: migrations/001_initial_schema.sql
-- Run: psql -U bidkarts -d bidkarts -f migrations/001_initial_schema.sql
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  phone             TEXT,
  password_hash     TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','vendor','expert','admin')),
  address           TEXT,
  is_verified       INTEGER DEFAULT 0,
  is_active         INTEGER DEFAULT 1,
  avatar_url        TEXT,
  reset_token       TEXT,
  reset_token_expiry TIMESTAMP,
  referral_code     TEXT UNIQUE,
  subscription_plan TEXT DEFAULT 'free',
  admin_notes       TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_referral    ON users(referral_code);

-- ─── VENDOR PROFILES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name          TEXT NOT NULL,
  owner_name            TEXT NOT NULL,
  service_area          TEXT,
  certifications        TEXT,
  experience_years      INTEGER DEFAULT 0,
  services_offered      TEXT,
  is_approved           INTEGER DEFAULT 0,
  is_featured           INTEGER DEFAULT 0,
  rating                NUMERIC(3,2) DEFAULT 0,
  total_reviews         INTEGER DEFAULT 0,
  total_projects        INTEGER DEFAULT 0,
  description           TEXT,
  website               TEXT,
  logo_url              TEXT,
  portfolio_images      TEXT,
  specializations       TEXT,
  subscription_plan     TEXT DEFAULT 'free',
  gst_number            TEXT,
  pan_number            TEXT,
  response_time_hours   INTEGER DEFAULT 24,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendor_user_id    ON vendor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_approved   ON vendor_profiles(is_approved);
CREATE INDEX IF NOT EXISTS idx_vendor_rating     ON vendor_profiles(rating DESC);

-- ─── EXPERT PROFILES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expert_profiles (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  certification       TEXT,
  experience          INTEGER DEFAULT 0,
  service_area        TEXT,
  specialization      TEXT,
  is_approved         INTEGER DEFAULT 0,
  rating              NUMERIC(3,2) DEFAULT 0,
  total_inspections   INTEGER DEFAULT 0,
  bio                 TEXT,
  expertise_area      TEXT,
  hourly_rate         NUMERIC(10,2) DEFAULT 1500,
  is_available        INTEGER DEFAULT 1,
  location            TEXT,
  service_types       TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── PROJECTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                  SERIAL PRIMARY KEY,
  customer_id         INTEGER NOT NULL REFERENCES users(id),
  vendor_id           INTEGER REFERENCES users(id),
  service_type        TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  location            TEXT NOT NULL,
  property_type       TEXT,
  budget_min          NUMERIC(12,2),
  budget_max          NUMERIC(12,2),
  timeline            TEXT,
  bid_opening_date    TIMESTAMP,
  bid_closing_date    TIMESTAMP,
  expert_support      INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'open'
                        CHECK(status IN ('open','bidding','vendor_selected','in_progress','completed','cancelled','suspended','flagged')),
  selected_vendor_id  INTEGER REFERENCES users(id),
  completion_note     TEXT,
  inspection_required INTEGER DEFAULT 0,
  admin_note          TEXT,
  admin_notes         TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_customer    ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_service     ON projects(service_type);
CREATE INDEX IF NOT EXISTS idx_projects_created     ON projects(created_at DESC);

-- ─── BIDS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bids (
  id                SERIAL PRIMARY KEY,
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vendor_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bid_amount        NUMERIC(12,2) NOT NULL,
  timeline_days     INTEGER NOT NULL,
  equipment_details TEXT,
  warranty_details  TEXT,
  message           TEXT,
  status            TEXT DEFAULT 'pending'
                      CHECK(status IN ('pending','accepted','rejected','withdrawn')),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_bids_project    ON bids(project_id);
CREATE INDEX IF NOT EXISTS idx_bids_vendor     ON bids(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bids_status     ON bids(status);

-- ─── DOCUMENTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  doc_type     TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_size    INTEGER DEFAULT 0,
  s3_key       TEXT,
  uploaded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);

-- ─── INSPECTIONS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspections (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id),
  customer_id     INTEGER NOT NULL REFERENCES users(id),
  expert_id       INTEGER REFERENCES users(id),
  status          TEXT DEFAULT 'requested',
  visit_date      TIMESTAMP,
  scheduled_at    TIMESTAMP,
  report_url      TEXT,
  recommendation  TEXT,
  notes           TEXT,
  admin_notes     TEXT,
  fee             NUMERIC(10,2) DEFAULT 1500,
  rating          INTEGER,
  review          TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  project_id          INTEGER REFERENCES projects(id),
  inspection_id       INTEGER,
  milestone_id        INTEGER,
  payment_type        TEXT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT DEFAULT 'INR',
  status              TEXT DEFAULT 'pending'
                        CHECK(status IN ('pending','completed','failed','refunded')),
  gateway             TEXT DEFAULT 'razorpay',
  transaction_id      TEXT,
  gateway_order_id    TEXT,
  gateway_payment_id  TEXT,
  payment_method      TEXT,
  receipt             TEXT,
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_user       ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_project    ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_type       ON payments(payment_type);

-- ─── ESCROW ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escrow (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  milestone_id INTEGER,
  customer_id  INTEGER NOT NULL REFERENCES users(id),
  amount       NUMERIC(12,2) NOT NULL,
  status       TEXT DEFAULT 'held' CHECK(status IN ('held','released','refunded')),
  payment_id   INTEGER,
  notes        TEXT,
  released_at  TIMESTAMP,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escrow_project   ON escrow(project_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status    ON escrow(status);

-- ─── MILESTONES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
  id               SERIAL PRIMARY KEY,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  due_date         DATE,
  amount           NUMERIC(12,2),
  status           TEXT DEFAULT 'pending'
                     CHECK(status IN ('pending','in_progress','completed','approved','paid')),
  sort_order       INTEGER DEFAULT 0,
  completion_note  TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  type         TEXT DEFAULT 'info',
  is_read      INTEGER DEFAULT 0,
  related_id   INTEGER,
  related_type TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id, is_read);

-- ─── REVIEWS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  reviewer_id  INTEGER NOT NULL REFERENCES users(id),
  vendor_id    INTEGER NOT NULL REFERENCES users(id),
  rating       INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, reviewer_id)
);

-- ─── CONVERSATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  customer_id  INTEGER NOT NULL REFERENCES users(id),
  vendor_id    INTEGER NOT NULL REFERENCES users(id),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, customer_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer  ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_vendor    ON conversations(vendor_id);

-- ─── MESSAGES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               SERIAL PRIMARY KEY,
  conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        INTEGER NOT NULL REFERENCES users(id),
  content          TEXT,
  attachment_url   TEXT,
  attachment_name  TEXT,
  is_read          INTEGER DEFAULT 0,
  is_flagged       INTEGER DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conv      ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender    ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread    ON messages(conversation_id, is_read);

-- ─── REFERRALS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id           SERIAL PRIMARY KEY,
  referrer_id  INTEGER NOT NULL REFERENCES users(id),
  referred_id  INTEGER NOT NULL UNIQUE REFERENCES users(id),
  status       TEXT DEFAULT 'applied',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── CONSULTATIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultations (
  id                SERIAL PRIMARY KEY,
  customer_id       INTEGER NOT NULL REFERENCES users(id),
  expert_id         INTEGER NOT NULL REFERENCES users(id),
  project_id        INTEGER REFERENCES projects(id),
  service_type      TEXT NOT NULL,
  topic             TEXT NOT NULL,
  description       TEXT,
  preferred_date    DATE,
  preferred_time    TEXT,
  scheduled_date    TEXT,
  scheduled_time    TEXT,
  consultation_type TEXT DEFAULT 'video',
  fee               NUMERIC(10,2) DEFAULT 1500,
  status            TEXT DEFAULT 'requested',
  video_link        TEXT,
  expert_notes      TEXT,
  customer_notes    TEXT,
  report_url        TEXT,
  recommendations   TEXT,
  summary           TEXT,
  rating            INTEGER,
  review            TEXT,
  completed_at      TIMESTAMP,
  location          TEXT,
  attachments       TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── DISPUTES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disputes (
  id                SERIAL PRIMARY KEY,
  project_id        INTEGER NOT NULL REFERENCES projects(id),
  customer_id       INTEGER NOT NULL REFERENCES users(id),
  vendor_id         INTEGER REFERENCES users(id),
  raised_by         INTEGER NOT NULL REFERENCES users(id),
  reason            TEXT NOT NULL,
  description       TEXT NOT NULL,
  evidence_urls     TEXT,
  customer_response TEXT,
  vendor_response   TEXT,
  status            TEXT DEFAULT 'open',
  resolution        TEXT,
  winner            TEXT,
  refund_amount     NUMERIC(12,2) DEFAULT 0,
  admin_notes       TEXT,
  resolved_at       TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── VENDOR SHORTLIST ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_shortlist (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES users(id),
  vendor_id    INTEGER NOT NULL REFERENCES users(id),
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, vendor_id)
);

-- ─── CONSULTATION SLOTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultation_slots (
  id               SERIAL PRIMARY KEY,
  expert_id        INTEGER NOT NULL REFERENCES users(id),
  slot_date        DATE NOT NULL,
  slot_time        TEXT NOT NULL,
  duration_mins    INTEGER DEFAULT 60,
  is_booked        INTEGER DEFAULT 0,
  consultation_id  INTEGER,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── AI RESPONSES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_responses (
  id          SERIAL PRIMARY KEY,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  category    TEXT DEFAULT 'general',
  is_approved INTEGER DEFAULT 0,
  version     INTEGER DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── SUBSCRIPTION TRANSACTIONS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_transactions (
  id               SERIAL PRIMARY KEY,
  vendor_id        INTEGER NOT NULL REFERENCES users(id),
  plan             TEXT NOT NULL,
  amount           NUMERIC(10,2) NOT NULL,
  status           TEXT DEFAULT 'completed',
  gateway_order_id TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Done! Run the /api/setup endpoint to seed demo data.
-- =============================================================================
