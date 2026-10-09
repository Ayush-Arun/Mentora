/**
 * FocusAI — Analytics & Difficulty API Routes (Phase 4)
 * Handles difficulty evaluation, consent management, gaze tracking signal ingestion,
 * and reiteration approval / dismissal.
 */
import { Router } from 'express';
import { requireAuth, requireTeacher } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { DifficultyService } from '../services/difficultyService.js';
import { AnalyticsService } from '../services/analyticsService.js';

export const analyticsRoutes = Router();

/**
 * GET /api/v1/analytics/session/:sessionId/difficulty
 * Get full difficulty assessment breakdown for the session.
 */
analyticsRoutes.get('/session/:sessionId/difficulty', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const assessments = await DifficultyService.getSessionAssessments(sessionId);

    // Summary stats
    const totalBlocks = assessments.length;
    const detectedBlocks = assessments.filter(a => a.status === 'difficulty_detected').length;
    const attentionBlocks = assessments.filter(a => a.status === 'needs_attention').length;

    res.json({
      data: {
        assessments,
        summary: {
          totalBlocks,
          detectedBlocks,
          attentionBlocks,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/analytics/session/:sessionId/consent
 * Student records or toggles webcam consent.
 */
analyticsRoutes.post('/session/:sessionId/consent', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { camera_enabled } = req.body;

    const { data: consent, error } = await supabaseAdmin
      .from('student_consents')
      .upsert({
        student_id: req.user.id,
        session_id: sessionId,
        camera_enabled: Boolean(camera_enabled),
        consented_at: new Date().toISOString(),
      }, { onConflict: 'student_id,session_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ data: consent });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/analytics/session/:sessionId/calibration
 * Student uploads calibration accuracy score and sample count.
 */
analyticsRoutes.post('/session/:sessionId/calibration', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { accuracy_score, sample_count = 9 } = req.body;

    const score = parseFloat(accuracy_score) || 0;
    const isUsable = score >= 0.5;

    const { data: calib, error } = await supabaseAdmin
      .from('calibration_results')
      .insert({
        student_id: req.user.id,
        session_id: sessionId,
        accuracy_score: score,
        sample_count: sample_count,
        is_usable: isUsable,
      })
      .select()
      .single();

    if (error) throw error;

    // Also update student_consents calibration_quality
    await supabaseAdmin
      .from('student_consents')
      .update({
        calibration_quality: isUsable ? (score >= 0.8 ? 'good' : 'acceptable') : 'poor',
      })
      .eq('student_id', req.user.id)
      .eq('session_id', sessionId);

    res.json({ data: calib });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/analytics/session/:sessionId/gaze
 * Student submits privacy-preserving derived gaze observation signals.
 * (No raw camera frames, only content block dwell and return metrics).
 */
analyticsRoutes.post('/session/:sessionId/gaze', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { observations = [] } = req.body;

    if (!Array.isArray(observations) || observations.length === 0) {
      return res.json({ data: { recorded: 0 } });
    }

    const rows = observations.map(obs => ({
      student_id: req.user.id,
      session_id: sessionId,
      content_block_id: obs.content_block_id,
      dwell_ms: Math.min(120000, parseInt(obs.dwell_ms, 10) || 0),
      return_count: parseInt(obs.return_count, 10) || 1,
      quality_score: Math.min(1, Math.max(0, parseFloat(obs.quality_score) || 0.7)),
      sampled_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from('gaze_observations')
      .upsert(rows, { onConflict: 'student_id,session_id,content_block_id' });

    if (error) throw error;

    // Trigger difficulty evaluation for each touched block
    for (const obs of observations) {
      if (obs.content_block_id) {
        DifficultyService.computeBlockDifficulty(sessionId, obs.content_block_id).catch(() => {});
      }
    }

    res.json({ data: { recorded: rows.length } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/analytics/session/:sessionId/reiterations
 * Fetch reiteration events for the session.
 */
analyticsRoutes.get('/session/:sessionId/reiterations', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { data: events, error } = await supabaseAdmin
      .from('reiteration_events')
      .select('*, content_blocks(id, text, block_type)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data: events || [] });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/analytics/session/:sessionId/reiteration/:id
 * Teacher approves, edits, or dismisses a reiteration proposal.
 */
analyticsRoutes.patch('/session/:sessionId/reiteration/:id', requireAuth, requireTeacher, async (req, res, next) => {
  try {
    const { sessionId, id } = req.params;
    const { status, teacher_edited_explanation } = req.body;

    if (!['approved', 'dismissed', 'broadcast'].includes(status)) {
      return res.status(400).json({ error: { message: 'Invalid status. Must be approved, dismissed, or broadcast.' } });
    }

    const updates = { status };
    if (teacher_edited_explanation) updates.teacher_edited_explanation = teacher_edited_explanation;
    if (status === 'approved' || status === 'broadcast') {
      updates.approved_at = new Date().toISOString();
      updates.broadcast_at = new Date().toISOString();
    }
    if (status === 'dismissed') {
      updates.dismissed_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabaseAdmin
      .from('reiteration_events')
      .update(updates)
      .eq('id', id)
      .eq('session_id', sessionId)
      .select('*, content_blocks(id, text)')
      .single();

    if (error) throw error;

    // If approved or broadcast, emit event to connected students
    if (status === 'approved' || status === 'broadcast') {
      let explanationPayload = null;
      try {
        explanationPayload = updated.teacher_edited_explanation
          ? { text: updated.teacher_edited_explanation }
          : JSON.parse(updated.ai_explanation);
      } catch {
        explanationPayload = { text: updated.ai_explanation };
      }

      await supabaseAdmin.from('session_events').insert({
        session_id: sessionId,
        event_type: 'REITERATION_BROADCAST',
        payload: {
          reiteration_id: updated.id,
          content_block_id: updated.content_block_id,
          explanation: explanationPayload,
          concept_text: updated.content_blocks?.text || '',
        },
        created_by: req.user.id,
      });
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/analytics/session/:sessionId/group
 * Detailed Group & Class Analytics with multi-denominator accounting, slide breakdown,
 * comprehension stats, and post-reiteration evaluation.
 */
analyticsRoutes.get('/session/:sessionId/group', requireAuth, requireTeacher, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const analytics = await AnalyticsService.getGroupAnalytics(sessionId);
    res.json({ data: analytics });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/analytics/session/:sessionId/students
 * Roster of enrolled/participating students with struggle indicators for teacher.
 */
analyticsRoutes.get('/session/:sessionId/students', requireAuth, requireTeacher, async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('class_id')
      .eq('id', sessionId)
      .single();

    if (!session) return res.status(404).json({ error: { message: 'Session not found.' } });

    const { data: members } = await supabaseAdmin
      .from('class_members')
      .select('student_id, profiles(id, full_name, email, avatar_url)')
      .eq('class_id', session.class_id)
      .eq('status', 'active');

    // Fetch struggle metrics for each student
    const studentList = await Promise.all((members || []).map(async (m) => {
      const studentId = m.student_id;
      const profile = m.profiles;

      // Count wrong answers in this session
      const { data: tests } = await supabaseAdmin
        .from('comprehension_tests')
        .select('id')
        .eq('session_id', sessionId);
      const testIds = (tests || []).map(t => t.id);

      let wrongCount = 0;
      let totalTests = 0;
      if (testIds.length > 0) {
        const { data: responses } = await supabaseAdmin
          .from('comprehension_responses')
          .select('is_correct')
          .eq('student_id', studentId)
          .in('test_id', testIds);
        totalTests = (responses || []).length;
        wrongCount = (responses || []).filter(r => r.is_correct === false).length;
      }

      // Count confusion submissions
      const { count: confusedCount } = await supabaseAdmin
        .from('student_feedback')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('student_id', studentId)
        .eq('feedback_type', 'confused');

      return {
        id: studentId,
        fullName: profile?.full_name || 'Student',
        email: profile?.email || '',
        avatarUrl: profile?.avatar_url || null,
        totalTests,
        wrongCount,
        confusedCount: confusedCount || 0,
        needsAttention: wrongCount > 0 || (confusedCount || 0) > 0,
      };
    }));

    res.json({ data: studentList });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/analytics/session/:sessionId/student/:studentId
 * Individual Student Learning Profile. Accessible by teacher OR the student themselves.
 */
analyticsRoutes.get('/session/:sessionId/student/:studentId', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, studentId } = req.params;

    // Strict Privacy: Only the teacher of the class OR the student themselves can view
    if (req.userRole !== 'teacher' && req.user.id !== studentId) {
      return res.status(403).json({ error: { message: 'Forbidden. You cannot view another student’s private profile.' } });
    }

    const profile = await AnalyticsService.getStudentProfile(sessionId, studentId);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/analytics/student/me
 * Student's Personal Learning Portal Insights across sessions.
 */
analyticsRoutes.get('/student/me', requireAuth, async (req, res, next) => {
  try {
    const insights = await AnalyticsService.getStudentPersonalInsights(req.user.id);
    res.json({ data: insights });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/analytics/class/:classId/history
 * Multi-session Historical Comparison for a Class.
 */
analyticsRoutes.get('/class/:classId/history', requireAuth, requireTeacher, async (req, res, next) => {
  try {
    const { classId } = req.params;
    const history = await AnalyticsService.getClassHistoricalSummary(classId);
    res.json({ data: history });
  } catch (err) {
    next(err);
  }
});

