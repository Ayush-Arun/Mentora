/**
 * FocusAI — Comprehension Testing API Routes (Phase 4)
 * Allows teachers to create quick check tests and students to answer them.
 */
import { Router } from 'express';
import { requireAuth, requireTeacher } from '../middleware/auth.js';
import { ComprehensionService } from '../services/comprehensionService.js';

export const testRoutes = Router();

/**
 * POST /api/v1/tests
 * Teacher creates and launches a comprehension test for the session.
 */
testRoutes.post('/', requireAuth, requireTeacher, async (req, res, next) => {
  try {
    const {
      session_id,
      content_block_id,
      question,
      options,
      correct_answer,
      test_type,
      source,
    } = req.body;

    const test = await ComprehensionService.createTest({
      sessionId: session_id,
      contentBlockId: content_block_id || null,
      createdBy: req.user.id,
      question,
      options,
      correctAnswer: correct_answer,
      testType: test_type || 'mcq',
      source: source || 'teacher',
    });

    res.status(201).json({ data: test });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/tests/session/:sessionId
 * Fetch tests created for this session.
 */
testRoutes.get('/session/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { content_block_id } = req.query;

    const tests = await ComprehensionService.getSessionTests(sessionId, content_block_id || null);
    res.json({ data: tests });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/tests/:id/respond
 * Student submits an answer to a test.
 */
testRoutes.post('/:id/respond', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { session_id, selected_answer, confidence_rating, response_time_ms } = req.body;

    if (!session_id || selected_answer === undefined) {
      return res.status(400).json({ error: { message: 'session_id and selected_answer are required' } });
    }

    const response = await ComprehensionService.submitResponse({
      testId: id,
      studentId: req.user.id,
      sessionId: session_id,
      selectedAnswer: selected_answer,
      confidenceRating: confidence_rating,
      responseTimeMs: response_time_ms,
    });

    res.json({ data: response });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/tests/:id/results
 * Teacher views live test results breakdown.
 */
testRoutes.get('/:id/results', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const results = await ComprehensionService.getTestResults(id);
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});
