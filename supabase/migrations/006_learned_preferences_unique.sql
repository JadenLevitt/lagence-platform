-- Add unique constraint for upsert on learned_preferences
-- Used by both feedback-processor.js and chat-based rule setting
CREATE UNIQUE INDEX IF NOT EXISTS idx_learned_preferences_unique
  ON learned_preferences(agent_id, preference_type, field_name);
