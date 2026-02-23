-- Add supplementary_files column to jobs table
-- Stores paths to additional uploaded files (line sheet PDF, fabric workbook CSV)
-- Format: { "line_sheet": "path/to/file.pdf", "fabric_workbook": "path/to/file.csv" }
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS supplementary_files JSONB DEFAULT NULL;
