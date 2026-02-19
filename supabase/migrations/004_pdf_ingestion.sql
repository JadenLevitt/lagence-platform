-- Uploaded documents (general PDFs, not just tech packs)
CREATE TABLE IF NOT EXISTS uploaded_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL DEFAULT 'ecommerce',
  job_id UUID,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  document_type TEXT,                     -- 'line_sheet', 'spec_sheet', 'supplier_doc', 'general'
  page_count INTEGER,
  extracted_data JSONB DEFAULT '{}',
  extraction_prompt TEXT,
  status TEXT DEFAULT 'uploaded',         -- uploaded, processing, extracted, failed
  error_message TEXT,
  uploaded_by TEXT DEFAULT 'web-user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_documents_job_id ON uploaded_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_documents_type ON uploaded_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_uploaded_documents_status ON uploaded_documents(status);

DROP TRIGGER IF EXISTS update_uploaded_documents_updated_at ON uploaded_documents;
CREATE TRIGGER update_uploaded_documents_updated_at
  BEFORE UPDATE ON uploaded_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add supplementary_files column to jobs table for multi-file uploads
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS supplementary_files JSONB DEFAULT '[]';
