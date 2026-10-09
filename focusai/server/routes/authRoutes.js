/**
 * FocusAI — Auth Routes
 * POST /api/v1/auth/signup
 * POST /api/v1/auth/signin
 * POST /api/v1/auth/refresh
 * POST /api/v1/auth/logout
 * GET  /api/v1/auth/me
 * GET  /api/v1/auth/config   (public — returns safe browser config)
 * GET  /api/v1/auth/health
 */
import { Router } from 'express';
import { AuthService } from '../services/authService.js';
import { authenticateToken } from '../middleware/auth.js';
import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';

export const authRouter = Router();

// ─── Public Config (anon key only — safe for browser) ─────────────────────────
authRouter.get('/config', (req, res) => {
  // Only expose the anon key — service role key STAYS on the server
  return res.json({
    data: {
      supabase_url: config.supabase.url,
      supabase_anon_key: config.supabase.anonKey,
    },
    request_id: req.id,
  });
});

// ─── Sign Up ───────────────────────────────────────────────────────────────────
authRouter.post('/signup', async (req, res, next) => {
  try {
    const { email, password, fullName, role } = req.body;
    const result = await AuthService.signup({ email, password, fullName, role });
    return res.status(201).json({ data: result, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Sign In ───────────────────────────────────────────────────────────────────
authRouter.post('/signin', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.signin({ email, password });
    return res.json({ data: result, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Token Refresh ─────────────────────────────────────────────────────────────
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: { code: 'missing_token', message: 'refresh_token is required.' }, request_id: req.id });
    }
    const result = await AuthService.refreshSession({ refreshToken: refresh_token });
    return res.json({ data: result, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Current User ──────────────────────────────────────────────────────────────
authRouter.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const profile = await AuthService.getProfile(req.userId);
    return res.json({
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
          full_name: profile.full_name,
          role: profile.role,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
        },
      },
      request_id: req.id,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Logout ────────────────────────────────────────────────────────────────────
authRouter.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    await AuthService.signout(token);
    return res.json({ data: { message: 'Signed out successfully.' }, request_id: req.id });
  } catch (err) {
    // Non-fatal — client should clear tokens regardless
    return res.json({ data: { message: 'Signed out.' }, request_id: req.id });
  }
});

// ─── Health ────────────────────────────────────────────────────────────────────
authRouter.get('/health', async (req, res) => {
  try {
    const { count } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true });
    return res.json({
      status: 'healthy',
      service: 'focusai-auth',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      metrics: { total_profiles: count ?? 0 },
      request_id: req.id,
    });
  } catch {
    return res.status(503).json({
      status: 'degraded',
      service: 'focusai-auth',
      message: 'Database unavailable — check Supabase credentials.',
      request_id: req.id,
    });
  }
});
