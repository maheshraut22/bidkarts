-- Add missing columns to consultations (safe - ignore if already exists handled by runtime)
ALTER TABLE consultations ADD COLUMN project_id INTEGER REFERENCES projects(id);
ALTER TABLE consultations ADD COLUMN service_type TEXT;
ALTER TABLE consultations ADD COLUMN location TEXT;
ALTER TABLE consultations ADD COLUMN attachments TEXT;

-- Add missing columns to projects
ALTER TABLE projects ADD COLUMN completion_note TEXT;
ALTER TABLE projects ADD COLUMN admin_note TEXT;
