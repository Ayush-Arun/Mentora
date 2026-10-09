/**
 * FocusAI — Authentication Middleware
 *
 * Verifies Supabase JWTs (issued by Supabase Auth, presented as Bearer tokens).
 * Attaches req.user (Supabase user) and req.profile (role + full_name) to request.
 */
import crypto from 'crypto';
import { supabaseAdmin } from '../supabase.js';
import { config } from '../config.js';

// ─── Request ID / Correlation Tracking ────────────────────────────────────────
export function requestIdMiddleware(req, res, next) {
  const requestId =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Correlation-ID', requestId);
  next();
}

// ─── In-Memory Rate Limiter (per IP) ──────────────────────────────────────────
const ipBuckets = new Map();

export function rateLimiter(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const { rateLimitWindowMs: windowMs, maxRequestsPerWindow: maxReq } = config.security;

  let bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.startTime > windowMs) {
    bucket = { startTime: now, count: 1 };
  } else {
    bucket.count++;
  }
  ipBuckets.set(ip, bucket);

  const remaining = Math.max(0, maxReq - bucket.count);
  const resetTime = Math.ceil((bucket.startTime + windowMs) / 1000);
  res.setHeader('X-RateLimit-Limit', maxReq);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);

  if (bucket.count > maxReq) {
    const retryAfter = Math.ceil((bucket.startTime + windowMs - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: {
        code: 'rate_limit_exceeded',
        message: `Too many requests. Retry in ${retryAfter}s.`,
        request_id: req.id,
        retry_after: retryAfter,
      },
    });
  }
  next();
}

// ─── Supabase JWT Authenticator ────────────────────────────────────────────────
/**
 * Verifies the Supabase Bearer token and attaches user + profile to the request.
 * Role is read from the `profiles` table — never trusted from JWT claims alone.
 */
import { createClient } from '@supabase/supabase-js';

// Dedicated client for token verification so admin client headers are never mutated
const tokenVerifierClient = createClient(config.supabase.url, config.supabase.anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'authentication_required',
        message: 'A valid Bearer token is required.',
        request_id: req.id,
      },
    });
  }

  try {
    // Verify token via dedicated client (never mutates service-role client)
    const { data: { user }, error: authError } = await tokenVerifierClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        error: {
          code: authError?.message?.includes('expired') ? 'token_expired' : 'invalid_token',
          message: authError?.message || 'Invalid or expired authentication token.',
          request_id: req.id,
        },
      });
    }

    // Fetch role from profiles table (server-authoritative role check)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({
        error: {
          code: 'profile_not_found',
          message: 'User profile not found. Please complete registration.',
          request_id: req.id,
        },
      });
    }

    req.user = user;           // Supabase Auth user object
    req.user.role = profile.role;
    req.profile = profile;     // { role, full_name, avatar_url }
    req.userId = user.id;
    req.userRole = profile.role;
    next();
  } catch (err) {
    console.error('[auth] Token verification error:', err.message);
    return res.status(500).json({
      error: {
        code: 'auth_service_error',
        message: 'Authentication service error.',
        request_id: req.id,
      },
    });
  }
}

// ─── Role Guard ────────────────────────────────────────────────────────────────
/**
 * Middleware factory: require one of the specified roles.
 * Must be used AFTER authenticateToken.
 * @param {...string} roles - e.g. requireRole('teacher') or requireRole('teacher','student')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({
        error: {
          code: 'forbidden',
          message: `Access denied. Required role: ${roles.join(' or ')}.`,
          request_id: req.id,
        },
      });
    }
    next();
  };
}

// ─── Class Membership Guard ────────────────────────────────────────────────────
/**
 * Verifies the authenticated user is a member of the class specified in req.params.classId.
 * Attaches req.membership = { class_id, student_id, status } for downstream use.
 * Must be used AFTER authenticateToken.
 */
export async function requireClassMember(req, res, next) {
  const classId = req.params.classId || req.body.class_id;
  if (!classId) {
    return res.status(400).json({
      error: { code: 'missing_class_id', message: 'class_id is required.', request_id: req.id },
    });
  }

  try {
    // Teachers own the class; students must be enrolled
    if (req.userRole === 'teacher') {
      const { data: cls } = await supabaseAdmin
        .from('classes')
        .select('id')
        .eq('id', classId)
        .eq('teacher_id', req.userId)
        .single();
      if (!cls) {
        return res.status(403).json({
          error: { code: 'not_class_owner', message: 'You do not own this class.', request_id: req.id },
        });
      }
    } else {
      const { data: membership } = await supabaseAdmin
        .from('class_members')
        .select('class_id, student_id, status')
        .eq('class_id', classId)
        .eq('student_id', req.userId)
        .eq('status', 'active')
        .single();
      if (!membership) {
        return res.status(403).json({
          error: { code: 'not_enrolled', message: 'You are not enrolled in this class.', request_id: req.id },
        });
      }
      req.membership = membership;
    }
    req.classId = classId;
    next();
  } catch (err) {
    console.error('[auth] Class membership check error:', err.message);
    next(err);
  }
}

export const requireAuth = authenticateToken;
export const requireTeacher = requireRole('teacher');
