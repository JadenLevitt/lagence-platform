/**
 * Shared Supabase Client
 *
 * Singleton client for database operations across the platform.
 */

const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }

    supabaseClient = createClient(url, key);
  }

  return supabaseClient;
}

module.exports = { getSupabaseClient };
