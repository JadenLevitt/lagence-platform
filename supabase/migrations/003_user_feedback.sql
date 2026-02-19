-- User feedback on agent responses and extracted data
CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL DEFAULT 'ecommerce',
  feedback_type TEXT NOT NULL,            -- 'response_rating', 'field_correction', 'extraction_quality', 'general'
  rating INTEGER,                          -- 1 (thumbs down) or 5 (thumbs up) for response_rating
  job_id UUID,
  field_name TEXT,                         -- for field-level corrections
  original_value TEXT,                     -- what the agent extracted
  corrected_value TEXT,                    -- what the user said it should be
  style_number TEXT,                       -- for field corrections
  user_comment TEXT,
  chat_context JSONB DEFAULT '{}',         -- conversation snippet for response feedback
  applied_to_config BOOLEAN DEFAULT false, -- has this feedback been incorporated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learned preferences (agent behavior adjustments from accumulated feedback)
CREATE TABLE IF NOT EXISTS learned_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL DEFAULT 'ecommerce',
  preference_type TEXT NOT NULL,           -- 'extraction_rule', 'response_style', 'field_default', 'classification_hint'
  field_name TEXT,                          -- for field-specific preferences
  rule TEXT NOT NULL,                       -- human-readable description of the learned rule
  evidence_count INTEGER DEFAULT 1,        -- how many feedback items support this
  confidence FLOAT DEFAULT 0.5,            -- 0.0 to 1.0
  is_active BOOLEAN DEFAULT true,
  source_feedback_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_agent ON user_feedback(agent_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_user_feedback_field ON user_feedback(field_name);
CREATE INDEX IF NOT EXISTS idx_learned_preferences_agent ON learned_preferences(agent_id);
CREATE INDEX IF NOT EXISTS idx_learned_preferences_active ON learned_preferences(is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS update_learned_preferences_updated_at ON learned_preferences;
CREATE TRIGGER update_learned_preferences_updated_at
  BEFORE UPDATE ON learned_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
