-- Add columns for job resume capability
-- These track progress so jobs can pick up where they left off after a crash

-- completed_downloads: array of style numbers that have been downloaded
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_downloads JSONB DEFAULT '[]';

-- completed_extractions: array of style numbers that have been extracted
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_extractions JSONB DEFAULT '[]';

-- partial_extractions: map of styleNo -> extracted data for resume
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS partial_extractions JSONB DEFAULT '{}';
