-- Add missing tables that are created at runtime in index.tsx
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount REAL,
  status TEXT DEFAULT 'pending',
  due_date DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  vendor_id INTEGER,
  raised_by INTEGER NOT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_urls TEXT,
  customer_response TEXT,
  vendor_response TEXT,
  status TEXT DEFAULT 'open',
  resolution TEXT,
  winner TEXT,
  refund_amount REAL DEFAULT 0,
  admin_notes TEXT,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (customer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  expert_id INTEGER NOT NULL,
  topic TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'requested',
  consultation_type TEXT DEFAULT 'video',
  fee REAL DEFAULT 1500,
  preferred_date DATE,
  preferred_time TEXT,
  scheduled_at DATETIME,
  video_link TEXT,
  summary TEXT,
  recommendations TEXT,
  report_url TEXT,
  customer_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (expert_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS consultation_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expert_id INTEGER NOT NULL,
  slot_date DATE NOT NULL,
  slot_time TEXT NOT NULL,
  duration_mins INTEGER DEFAULT 60,
  is_booked INTEGER DEFAULT 0,
  consultation_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expert_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vendor_shortlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  vendor_id INTEGER NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, vendor_id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (vendor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ai_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_approved INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'completed',
  gateway_order_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES users(id)
);

-- Add admin_notes to inspections
ALTER TABLE inspections ADD COLUMN admin_notes TEXT;

-- Add extra columns to existing tables
ALTER TABLE projects ADD COLUMN bid_opening_date DATETIME;
ALTER TABLE projects ADD COLUMN bid_closing_date DATETIME;
ALTER TABLE projects ADD COLUMN expert_support INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN vendor_id INTEGER;
ALTER TABLE projects ADD COLUMN completion_note TEXT;
ALTER TABLE projects ADD COLUMN admin_note TEXT;
ALTER TABLE users ADD COLUMN reset_token TEXT;
ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME;
ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE users ADD COLUMN subscription_plan TEXT DEFAULT 'free';
ALTER TABLE vendor_profiles ADD COLUMN portfolio_images TEXT;
ALTER TABLE vendor_profiles ADD COLUMN specializations TEXT;
ALTER TABLE vendor_profiles ADD COLUMN subscription_plan TEXT DEFAULT 'free';
ALTER TABLE vendor_profiles ADD COLUMN gst_number TEXT;
ALTER TABLE vendor_profiles ADD COLUMN pan_number TEXT;
ALTER TABLE vendor_profiles ADD COLUMN response_time_hours INTEGER DEFAULT 24;
ALTER TABLE expert_profiles ADD COLUMN bio TEXT;
ALTER TABLE expert_profiles ADD COLUMN expertise_area TEXT;
ALTER TABLE expert_profiles ADD COLUMN hourly_rate REAL DEFAULT 1500;
ALTER TABLE expert_profiles ADD COLUMN is_available INTEGER DEFAULT 1;
ALTER TABLE payments ADD COLUMN milestone_id INTEGER;
ALTER TABLE payments ADD COLUMN receipt TEXT;
ALTER TABLE payments ADD COLUMN notes TEXT;
ALTER TABLE messages ADD COLUMN is_flagged INTEGER DEFAULT 0;
