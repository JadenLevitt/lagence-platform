-- Team contacts directory
CREATE TABLE IF NOT EXISTS team_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  data_domains TEXT[] DEFAULT '{}',       -- what data this team owns
  agent_id TEXT DEFAULT 'ecommerce',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email outreach log
CREATE TABLE IF NOT EXISTS outreach_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL DEFAULT 'ecommerce',
  job_id UUID,
  template_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_team TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  status TEXT DEFAULT 'pending_approval',  -- pending_approval, auto_approved, sent, failed
  risk_level TEXT DEFAULT 'low',           -- low, high
  approved_by TEXT,
  sent_at TIMESTAMPTZ,
  resend_message_id TEXT,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_emails_job_id ON outreach_emails(job_id);
CREATE INDEX IF NOT EXISTS idx_outreach_emails_status ON outreach_emails(status);
CREATE INDEX IF NOT EXISTS idx_team_contacts_team ON team_contacts(team_name);
CREATE INDEX IF NOT EXISTS idx_team_contacts_agent ON team_contacts(agent_id);

DROP TRIGGER IF EXISTS update_team_contacts_updated_at ON team_contacts;
CREATE TRIGGER update_team_contacts_updated_at
  BEFORE UPDATE ON team_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_outreach_emails_updated_at ON outreach_emails;
CREATE TRIGGER update_outreach_emails_updated_at
  BEFORE UPDATE ON outreach_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
