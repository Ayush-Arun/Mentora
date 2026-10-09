/**
 * FocusAI — Session Routes
 * Manages live classroom lifecycle, slide synchronization, and student feedback.
 */
import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { SessionService } from '../services/sessionService.js';
import { supabaseAdmin } from '../supabase.js';

export const sessionRoutes = Router();

// Create session (teacher only)
sessionRoutes.post(
  '/',
  authenticateToken,
  requireRole('teacher'),
  async (req, res) => {
    try {
      const { class_id, settings } = req.body;
      if (!class_id) {
        return res.status(400).json({
          error: {
            code: 'class_id_required',
            message: 'class_id is required to create a session.',
            request_id: req.id,
          },
        });
      }

      const session = await SessionService.createSession({
        classId: class_id,
        teacherId: req.user.id,
        settings,
      });

      res.status(201).json({
        data: session,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'session_creation_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// Start session (teacher only)
sessionRoutes.post(
  '/:id/start',
  authenticateToken,
  requireRole('teacher'),
  async (req, res) => {
    try {
      const session = await SessionService.startSession(req.params.id, req.user.id);
      res.json({
        data: session,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'session_start_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// Get session details and active slide content (teacher or student)
sessionRoutes.get(
  '/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await SessionService.getSession(
        req.params.id,
        req.user.id,
        req.userRole || req.profile?.role || req.user?.role
      );

      res.json({
        data: result,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 404).json({
        error: {
          code: 'session_fetch_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// Update authoritative slide index (teacher only)
sessionRoutes.patch(
  '/:id/slide',
  authenticateToken,
  requireRole('teacher'),
  async (req, res) => {
    try {
      const { slide_index } = req.body;
      if (slide_index === undefined) {
        return res.status(400).json({
          error: {
            code: 'slide_index_required',
            message: 'slide_index is required.',
            request_id: req.id,
          },
        });
      }

      const updated = await SessionService.updateSlide(
        req.params.id,
        req.user.id,
        slide_index
      );

      res.json({
        data: updated,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'slide_update_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// Update session status: live, paused, ended (teacher only)
sessionRoutes.patch(
  '/:id/status',
  authenticateToken,
  requireRole('teacher'),
  async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({
          error: {
            code: 'status_required',
            message: 'status is required (live, paused, or ended).',
            request_id: req.id,
          },
        });
      }

      const updated = await SessionService.updateStatus(
        req.params.id,
        req.user.id,
        status
      );

      res.json({
        data: updated,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'status_update_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// Submit student feedback during session (student only)
sessionRoutes.post(
  '/:id/feedback',
  authenticateToken,
  requireRole('student'),
  async (req, res) => {
    try {
      const { content_block_id, feedback_type, message } = req.body;

      const fb = await SessionService.submitFeedback(
        req.params.id,
        req.user.id,
        {
          contentBlockId: content_block_id || null,
          feedbackType: feedback_type,
          message: message || '',
        }
      );

      res.status(201).json({
        data: fb,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'feedback_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// Get live feedback summary (teacher only)
sessionRoutes.get(
  '/:id/feedback',
  authenticateToken,
  requireRole('teacher'),
  async (req, res) => {
    try {
      const summary = await SessionService.getFeedbackSummary(req.params.id, req.user.id);
      res.json({
        data: summary,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'feedback_summary_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// Get session event log (for catch-up / reconnect)
sessionRoutes.get(
  '/:id/events',
  authenticateToken,
  async (req, res) => {
    try {
      const events = await SessionService.getSessionEvents(
        req.params.id,
        req.query.since || null
      );
      res.json({
        data: events,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'events_fetch_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// List sessions for a class
sessionRoutes.get(
  '/class/:classId',
  authenticateToken,
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('class_id', req.params.classId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      res.json({
        data: data || [],
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'sessions_list_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);
