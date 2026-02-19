/**
 * Feedback Processor
 *
 * Aggregates individual user corrections into learned preferences,
 * and injects learned preferences into extraction prompts.
 */

const { getSupabaseClient } = require('../../../../shared/supabase-client');

const FEEDBACK_THRESHOLD = 3; // Require 3+ corrections before creating a learned preference

/**
 * Analyze feedback patterns and generate/update learned preferences.
 * Called periodically or after N new feedback items.
 */
async function processFeedbackPatterns(agentId = 'ecommerce') {
  const supabase = getSupabaseClient();

  // 1. Fetch unprocessed field corrections
  const { data: corrections, error } = await supabase
    .from('user_feedback')
    .select('*')
    .eq('agent_id', agentId)
    .eq('feedback_type', 'field_correction')
    .eq('applied_to_config', false)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !corrections || corrections.length === 0) {
    return { processed: 0, rules_created: 0 };
  }

  // 2. Group by field_name
  const byField = {};
  for (const c of corrections) {
    if (!c.field_name) continue;
    if (!byField[c.field_name]) byField[c.field_name] = [];
    byField[c.field_name].push(c);
  }

  let rulesCreated = 0;
  const processedIds = [];

  // 3. For each field with enough corrections, create/update a learned preference
  for (const [field, items] of Object.entries(byField)) {
    if (items.length < FEEDBACK_THRESHOLD) continue;

    // Synthesize a rule from the corrections
    const rule = synthesizeRule(field, items);

    // Upsert into learned_preferences
    const { error: upsertError } = await supabase
      .from('learned_preferences')
      .upsert({
        agent_id: agentId,
        preference_type: 'extraction_rule',
        field_name: field,
        rule: rule,
        evidence_count: items.length,
        confidence: Math.min(0.95, 0.3 + items.length * 0.1),
        is_active: true,
        source_feedback_ids: items.map(i => i.id)
      }, {
        onConflict: 'agent_id,preference_type,field_name'
      });

    if (!upsertError) {
      rulesCreated++;
      processedIds.push(...items.map(i => i.id));
    }
  }

  // 4. Mark processed feedback
  if (processedIds.length > 0) {
    await supabase
      .from('user_feedback')
      .update({ applied_to_config: true })
      .in('id', processedIds);
  }

  return { processed: processedIds.length, rules_created: rulesCreated };
}

/**
 * Synthesize a human-readable rule from a set of field corrections.
 */
function synthesizeRule(fieldName, corrections) {
  // Group corrections by pattern (original → corrected)
  const patterns = {};
  for (const c of corrections) {
    const key = `${c.original_value || '(empty)'} → ${c.corrected_value || '(empty)'}`;
    if (!patterns[key]) patterns[key] = 0;
    patterns[key]++;
  }

  // Build rule text from most common patterns
  const sorted = Object.entries(patterns).sort((a, b) => b[1] - a[1]);
  const patternDescriptions = sorted
    .slice(0, 3)
    .map(([pattern, count]) => `${pattern} (${count}x)`)
    .join('; ');

  return `For ${fieldName}: Common corrections: ${patternDescriptions}. Apply these correction patterns when extracting this field.`;
}

/**
 * Get active learned preferences to inject into extraction prompts.
 */
async function getActivePreferences(agentId = 'ecommerce') {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('learned_preferences')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_active', true)
    .gte('confidence', 0.4)
    .order('confidence', { ascending: false });

  if (error) {
    console.error('[feedback-processor] Error loading preferences:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Build a "learned corrections" addendum for the extraction prompt.
 */
function buildFeedbackPromptAddendum(preferences) {
  if (!preferences || preferences.length === 0) return '';

  return `\n\nLEARNED CORRECTIONS (from previous user feedback — follow these rules):\n${
    preferences.map(p => `- ${p.field_name}: ${p.rule}`).join('\n')
  }`;
}

module.exports = {
  processFeedbackPatterns,
  getActivePreferences,
  buildFeedbackPromptAddendum,
  FEEDBACK_THRESHOLD
};
