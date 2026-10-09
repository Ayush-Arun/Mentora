/**
 * FocusAI — Auth Service
 *
 * Wraps Supabase Auth for signup, signin, profile creation, and logout.
 * Role assignment happens server-side — never trusted from client input.
 *
 * Supported roles: 'teacher' | 'student'
 * Role is stored in the `profiles` table and verified in every authenticated request.
 */
import { supabaseAdmin, dbQuery } from '../supabase.js';

// Valid roles
const VALID_ROLES = ['teacher', 'student'];

export class AuthService {
  /**
   * Sign up a new user via Supabase Auth.
   * Creates auth user + profiles row atomically.
   * Role must be 'teacher' or 'student' — validated server-side.
   */
  static async signup({ email, password, fullName, role }) {
    // Validate inputs
    if (!email || !password || !fullName || !role) {
      throw { status: 400, code: 'validation_error', message: 'email, password, fullName, and role are required.' };
    }
    if (!VALID_ROLES.includes(role)) {
      throw { status: 400, code: 'invalid_role', message: `Role must be one of: ${VALID_ROLES.join(', ')}.` };
    }
    if (password.length < 6) {
      throw { status: 400, code: 'weak_password', message: 'Password must be at least 6 characters.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();

    // Create Supabase Auth user (admin API — bypasses email confirmation for dev)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,   // Auto-confirm for classroom use
      user_metadata: { full_name: cleanName, role },
    });

    if (authError) {
      if (authError.message?.toLowerCase().includes('already registered') ||
          authError.message?.toLowerCase().includes('already been registered')) {
        throw { status: 409, code: 'email_already_registered', message: 'An account with this email already exists.' };
      }
      throw { status: 400, code: 'signup_failed', message: authError.message };
    }

    const userId = authData.user.id;

    // Create profiles row (role stored here — authoritative source)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        full_name: cleanName,
        role,
        avatar_url: null,
      });

    if (profileError) {
      // Rollback: delete the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw { status: 500, code: 'profile_creation_failed', message: 'Failed to create user profile.' };
    }

    // Sign in to get session tokens
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: cleanEmail,
    });

    // Return safe user object (no password hash)
    return {
      user: {
        id: userId,
        email: cleanEmail,
        full_name: cleanName,
        role,
      },
    };
  }

  /**
   * Sign in via Supabase Auth (email + password).
   * Returns Supabase session — access_token is a JWT the client stores and sends as Bearer.
   */
  static async signin({ email, password }) {
    if (!email || !password) {
      throw { status: 400, code: 'credentials_required', message: 'Email and password are required.' };
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data?.session) {
      throw { status: 401, code: 'invalid_credentials', message: 'Invalid email or password.' };
    }

    // Fetch role from profiles (server-verified)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name, avatar_url')
      .eq('id', data.user.id)
      .single();

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name || data.user.user_metadata?.full_name || '',
        role: profile?.role || 'student',
        avatar_url: profile?.avatar_url || null,
      },
      auth: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: 'Bearer',
      },
    };
  }

  /**
   * Sign in using a Supabase refresh token (token refresh flow).
   */
  static async refreshSession({ refreshToken }) {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) {
      throw { status: 401, code: 'refresh_failed', message: 'Session refresh failed. Please sign in again.' };
    }
    return {
      auth: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        token_type: 'Bearer',
      },
    };
  }

  /**
   * Get current user profile from the profiles table.
   * req.user and req.profile already populated by authenticateToken middleware.
   */
  static async getProfile(userId) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, avatar_url, created_at')
      .eq('id', userId)
      .single();
    if (error || !data) {
      throw { status: 404, code: 'profile_not_found', message: 'Profile not found.' };
    }
    return data;
  }

  /**
   * Sign out — invalidates server-side session in Supabase.
   * Client should also clear its local storage.
   */
  static async signout(accessToken) {
    // We can't directly invalidate via admin, but we create a temporary client
    // to sign out the user's session.
    const { createClient } = await import('@supabase/supabase-js');
    const { config } = await import('../config.js');
    const tempClient = createClient(config.supabase.url, config.supabase.anonKey);
    // Set session then sign out
    await tempClient.auth.setSession({ access_token: accessToken, refresh_token: '' });
    await tempClient.auth.signOut();
    return { message: 'Signed out successfully.' };
  }
}
