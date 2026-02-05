-- L'AGENCE Platform - Initial Tables
-- Run this in Supabase SQL Editor if tables don't exist

-- Feature requests (logs all non-question requests from chat)
CREATE TABLE IF NOT EXISTS feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  conversation JSONB DEFAULT '[]',
  assistant_response TEXT,
  classification JSONB,
  action_taken JSONB,
  status TEXT DEFAULT 'new', -- new, in_progress, completed, rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capability proposals (for capability changes awaiting approval)
CREATE TABLE IF NOT EXISTS capability_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  complexity TEXT, -- low, medium, high
  status TEXT DEFAULT 'pending_review', -- pending_review, pending_approval, approved, rejected, implemented
  proposed_changes JSONB,
  pr_url TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_feature_requests_agent_id ON feature_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_capability_proposals_agent_id ON capability_proposals(agent_id);
CREATE INDEX IF NOT EXISTS idx_capability_proposals_status ON capability_proposals(status);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_feature_requests_updated_at ON feature_requests;
CREATE TRIGGER update_feature_requests_updated_at
  BEFORE UPDATE ON feature_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_capability_proposals_updated_at ON capability_proposals;
CREATE TRIGGER update_capability_proposals_updated_at
  BEFORE UPDATE ON capability_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
