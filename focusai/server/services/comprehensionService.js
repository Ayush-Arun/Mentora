/**
 * FocusAI — Comprehension Testing Service (Phase 4)
 * Handles in-session quick comprehension checks, MCQs, and confidence ratings.
 * Feeds directly into multimodal difficulty estimation.
 */
import { supabaseAdmin } from '../supabase.js';
import { DifficultyService } from './difficultyService.js';

export class ComprehensionService {
  /**
   * Teacher launches or schedules a comprehension check.
   */
  static async createTest({
    sessionId,
    contentBlockId = null,
    createdBy,
    question,
    options,
    correctAnswer,
    testType = 'mcq',
    source = 'teacher',
  }) {
    if (!question || !sessionId) throw new Error('sessionId and question are required.');

    const { data: test, error } = await supabaseAdmin
      .from('comprehension_tests')
      .insert({
        session_id: sessionId,
        content_block_id: contentBlockId,
        created_by: createdBy,
        question,
        options: options || null,
        correct_answer: correctAnswer || null,
        test_type: testType,
        source,
      })
      .select()
      .single();

    if (error) throw error;

    // Broadcast event to students
    await supabaseAdmin.from('session_events').insert({
      session_id: sessionId,
      event_type: 'COMPREHENSION_TEST_LAUNCHED',
      payload: {
        test_id: test.id,
        content_block_id: contentBlockId,
        question: test.question,
        options: test.options,
        test_type: test.test_type,
      },
      created_by: createdBy,
    });

    return test;
  }

  /**
   * Student responds to a comprehension test.
   */
  static async submitResponse({
    testId,
    studentId,
    sessionId,
    selectedAnswer,
    confidenceRating = 3,
    responseTimeMs = 0,
  }) {
    // 1. Fetch test to check answer
    const { data: test, error: tErr } = await supabaseAdmin
      .from('comprehension_tests')
      .select('*')
      .eq('id', testId)
      .single();

    if (tErr || !test) throw new Error('Comprehension test not found.');

    const isCorrect = test.correct_answer !== null && test.correct_answer !== undefined
      ? String(test.correct_answer).trim().toLowerCase() === String(selectedAnswer).trim().toLowerCase()
      : null;

    // 2. Insert or update response
    const { data: response, error: rErr } = await supabaseAdmin
      .from('comprehension_responses')
      .upsert({
        test_id: testId,
        student_id: studentId,
        session_id: sessionId,
        selected_answer: String(selectedAnswer),
        is_correct: isCorrect,
        confidence_rating: Math.max(1, Math.min(5, confidenceRating || 3)),
        response_time_ms: responseTimeMs,
        created_at: new Date().toISOString(),
      }, { onConflict: 'test_id,student_id' })
      .select()
      .single();

    if (rErr) throw rErr;

    // 3. Trigger immediate difficulty re-evaluation for the associated content block
    if (test.content_block_id) {
      DifficultyService.computeBlockDifficulty(sessionId, test.content_block_id).catch(err => {
        console.error('[ComprehensionService] Background difficulty update failed:', err);
      });
    }

    return response;
  }

  /**
   * Get active tests for a session / slide.
   */
  static async getSessionTests(sessionId, contentBlockId = null) {
    let query = supabaseAdmin
      .from('comprehension_tests')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (contentBlockId) query = query.eq('content_block_id', contentBlockId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Fetch aggregate results for a specific test (teacher view).
   */
  static async getTestResults(testId) {
    const { data: test, error: tErr } = await supabaseAdmin
      .from('comprehension_tests')
      .select('*')
      .eq('id', testId)
      .single();

    if (tErr || !test) throw new Error('Test not found.');

    const { data: responses, error: rErr } = await supabaseAdmin
      .from('comprehension_responses')
      .select('*, profiles(full_name, avatar_url)')
      .eq('test_id', testId);

    if (rErr) throw rErr;

    const total = responses.length;
    const correctCount = responses.filter(r => r.is_correct === true).length;
    const wrongCount = responses.filter(r => r.is_correct === false).length;
    const avgConfidence = total > 0
      ? (responses.reduce((sum, r) => sum + (r.confidence_rating || 0), 0) / total).toFixed(1)
      : null;

    return {
      test,
      total,
      correctCount,
      wrongCount,
      correctPct: total > 0 ? Math.round((correctCount / total) * 100) : 0,
      avgConfidence,
      responses,
    };
  }
}
