/**
 * FocusAI — Server-Side Supabase Admin Client
 *
 * Uses the SERVICE ROLE key — bypasses RLS for server-authoritative operations.
 * This file must NEVER be imported by frontend code.
 * Frontend uses the anon key via /api/v1/config + scripts/supabase-client.js.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn(
    '[FocusAI] WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. ' +
    'Server-side database operations will fail. ' +
    'Copy .env.example to .env and fill in your Supabase credentials.'
  );
}

/**
 * supabaseAdmin — service role client (server only).
 * Use for: user management, RLS-bypass operations, storage policy enforcement.
 */
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${config.supabase.serviceRoleKey}`,
      },
    },
  }
);

/**
 * Helper: Execute a Supabase query and throw a standardised error on failure.
 * @param {Promise} query — Supabase query promise
 * @param {string} context — Human-readable context for error messages
 */
export async function dbQuery(query, context = 'database operation') {
  const { data, error } = await query;
  if (error) {
    const err = new Error(`Supabase ${context} failed: ${error.message}`);
    err.status = error.code === '42501' ? 403 : 500;
    err.code = error.code || 'db_error';
    err.details = error.details;
    throw err;
  }
  return data;
}
