-- Add scheduled_date and scheduled_time to consultations (separate from scheduled_at)
ALTER TABLE consultations ADD COLUMN scheduled_date TEXT;
ALTER TABLE consultations ADD COLUMN scheduled_time TEXT;
ALTER TABLE consultations ADD COLUMN expert_notes TEXT;
ALTER TABLE consultations ADD COLUMN completed_at DATETIME;
ALTER TABLE consultations ADD COLUMN rating INTEGER;
ALTER TABLE consultations ADD COLUMN review TEXT;
