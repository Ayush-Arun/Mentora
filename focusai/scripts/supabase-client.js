/**
 * FocusAI — Browser-Side Supabase Client
 *
 * Uses the ANON KEY only — fetched from the server to avoid hardcoding in HTML.
 * The service role key never reaches the browser.
 *
 * Exports `supabase` (initialized client) and `getSession()`.
 */

let _supabase = null;
let _initPromise = null;

/**
 * Initialise the Supabase client by fetching public config from our server.
 * This ensures we never hardcode keys in HTML/JS files.
 */
async function initSupabase() {
  if (_supabase) return _supabase;

  const res = await fetch('/api/v1/auth/config');
  if (!res.ok) throw new Error('Failed to load Supabase configuration from server.');

  const { data } = await res.json();
  if (!data.supabase_url || !data.supabase_anon_key) {
    throw new Error('Server returned incomplete Supabase configuration. Check your .env file.');
  }

  // Dynamic import of Supabase from ESM CDN
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.4');
  _supabase = createClient(data.supabase_url, data.supabase_anon_key, {
    auth: {
      persistSession: true,
      storageKey: 'focusai_session',
      autoRefreshToken: true,
    },
  });

  return _supabase;
}

// Singleton promise — avoids multiple parallel init calls
export function getSupabase() {
  if (!_initPromise) {
    _initPromise = initSupabase().catch(err => {
      _initPromise = null; // Allow retry
      throw err;
    });
  }
  return _initPromise;
}

/**
 * Get the current session (from local storage + Supabase refresh if needed).
 * Returns null if not authenticated.
 */
export async function getSession() {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

/**
 * Get the current access token — for Authorization: Bearer headers.
 */
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}

/**
 * Auth state change listener.
 * @param {Function} callback - (event, session) => void
 */
export async function onAuthStateChange(callback) {
  const sb = await getSupabase();
  return sb.auth.onAuthStateChange(callback);
}

export { _supabase as supabase, getSupabase as getSupabaseClient };
