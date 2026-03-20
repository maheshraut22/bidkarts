-- BidKarts Database Schema
-- Migration 0001: Initial Schema

-- Users table (all roles)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer', 'vendor', 'expert', 'admin')),
  address TEXT,
  is_verified INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vendor profiles
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  service_area TEXT,
  certifications TEXT,
  experience_years INTEGER DEFAULT 0,
  services_offered TEXT,
  is_approved INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  total_projects INTEGER DEFAULT 0,
  description TEXT,
  website TEXT,
  logo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Expert profiles
CREATE TABLE IF NOT EXISTS expert_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  certification TEXT,
  experience INTEGER DEFAULT 0,
  service_area TEXT,
  specialization TEXT,
  is_approved INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  total_inspections INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  service_type TEXT NOT NULL CHECK(service_type IN ('hvac','electrical','plumbing','solar','fabrication','contracting')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  property_type TEXT,
  budget_min REAL,
  budget_max REAL,
  timeline TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','bidding','vendor_selected','in_progress','completed','cancelled')),
  selected_vendor_id INTEGER,
  inspection_required INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (selected_vendor_id) REFERENCES users(id)
);

-- Bids table
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  vendor_id INTEGER NOT NULL,
  bid_amount REAL NOT NULL,
  timeline_days INTEGER NOT NULL,
  equipment_details TEXT,
  warranty_details TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','withdrawn')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(project_id, vendor_id)
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Inspections table
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  expert_id INTEGER,
  status TEXT DEFAULT 'requested' CHECK(status IN ('requested','paid','assigned','scheduled','completed','cancelled')),
  visit_date DATETIME,
  report_url TEXT,
  recommendation TEXT,
  fee REAL DEFAULT 1500,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (expert_id) REFERENCES users(id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER,
  inspection_id INTEGER,
  payment_type TEXT NOT NULL CHECK(payment_type IN ('platform_fee','inspection_fee','vendor_advance')),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed','refunded')),
  gateway TEXT DEFAULT 'razorpay',
  transaction_id TEXT UNIQUE,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  payment_method TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK(type IN ('info','success','warning','error','bid','project','payment','inspection')),
  is_read INTEGER DEFAULT 0,
  related_id INTEGER,
  related_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  reviewer_id INTEGER NOT NULL,
  vendor_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id),
  FOREIGN KEY (vendor_id) REFERENCES users(id),
  UNIQUE(project_id, reviewer_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_service ON projects(service_type);
CREATE INDEX IF NOT EXISTS idx_bids_project ON bids(project_id);
CREATE INDEX IF NOT EXISTS idx_bids_vendor ON bids(vendor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

-- Insert demo admin user (password: Admin@123)
INSERT OR IGNORE INTO users (name, email, phone, password_hash, role, is_verified, is_active)
VALUES ('Admin User', 'admin@bidkarts.com', '9999999999', '$2a$10$placeholder_admin_hash', 'admin', 1, 1);

-- Insert demo customer
INSERT OR IGNORE INTO users (name, email, phone, password_hash, role, is_verified, is_active, address)
VALUES ('Rahul Sharma', 'customer@bidkarts.com', '9876543210', '$2a$10$placeholder_customer_hash', 'customer', 1, 1, 'Mumbai, Maharashtra');

-- Insert demo vendor user
INSERT OR IGNORE INTO users (name, email, phone, password_hash, role, is_verified, is_active)
VALUES ('Vikram Singh', 'vendor@bidkarts.com', '9123456789', '$2a$10$placeholder_vendor_hash', 'vendor', 1, 1);

-- Insert demo vendor profile
INSERT OR IGNORE INTO vendor_profiles (user_id, company_name, owner_name, service_area, certifications, experience_years, services_offered, is_approved, rating, total_reviews, description)
VALUES (3, 'Singh Tech Solutions', 'Vikram Singh', 'Mumbai, Pune, Nashik', 'ISO 9001, MNRE Certified', 8, 'hvac,electrical,solar', 1, 4.7, 45, 'Premium electrical and solar installation company with 8+ years of experience.');

-- Insert demo expert
INSERT OR IGNORE INTO users (name, email, phone, password_hash, role, is_verified, is_active)
VALUES ('Dr. Priya Patel', 'expert@bidkarts.com', '9988776655', '$2a$10$placeholder_expert_hash', 'expert', 1, 1);

INSERT OR IGNORE INTO expert_profiles (user_id, certification, experience, service_area, specialization, is_approved, rating)
VALUES (4, 'Licensed Electrical Engineer', 10, 'Mumbai, Thane', 'Solar EPC, Electrical Safety', 1, 4.9);
