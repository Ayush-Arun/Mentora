/**
 * FocusAI — Analytics Service (Phase 5)
 *
 * Implements:
 * 1. Comprehensive Group & Class Analytics with explicit multi-denominator accounting.
 * 2. Individual Student Learning Profiles (distinguishing direct feedback, test error, and inferred gaze).
 * 3. Before-and-After Reiteration Evaluation metrics.
 * 4. Multi-session Historical Comparisons.
 */
import { supabaseAdmin } from '../supabase.js';

export class AnalyticsService {
  /**
   * 16. Group and Class Analytics for a Live/Completed Session.
   * Multi-denominator accounting:
   * - Expected class size
   * - Connected students
   * - Students who submitted feedback
   * - Students with valid comprehension results
   * - Students with valid gaze observations
   */
  static async getGroupAnalytics(sessionId) {
    // 1. Fetch Session and Class Metadata
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('sessions')
      .select('*, classes(*)')
      .eq('id', sessionId)
      .single();

    if (sessErr || !session) throw new Error('Session not found.');

    const classId = session.class_id;

    // Expected student count
    const { count: enrolledCount } = await supabaseAdmin
      .from('class_members')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'active');

    const expectedClassSize = session.classes?.expected_students || Math.max(1, enrolledCount || 1);

    // 2. Distinct Student Denominators
    // Feedback respondents
    const { data: feedbackRows } = await supabaseAdmin
      .from('student_feedback')
      .select('student_id, feedback_type, content_block_id, message, created_at')
      .eq('session_id', sessionId);

    const feedbackStudentIds = new Set((feedbackRows || []).map(f => f.student_id));

    // Comprehension test respondents
    const { data: testRows } = await supabaseAdmin
      .from('comprehension_tests')
      .select('id, question, options, correct_answer, content_block_id, created_at')
      .eq('session_id', sessionId);

    const testIds = (testRows || []).map(t => t.id);

    let responseRows = [];
    if (testIds.length > 0) {
      const { data: responses } = await supabaseAdmin
        .from('comprehension_responses')
        .select('*, profiles(full_name, avatar_url)')
        .in('test_id', testIds);
      responseRows = responses || [];
    }

    const testStudentIds = new Set(responseRows.map(r => r.student_id));

    // Gaze observation participants
    const { data: gazeRows } = await supabaseAdmin
      .from('gaze_observations')
      .select('student_id, content_block_id, dwell_ms, return_count, quality_score')
      .eq('session_id', sessionId);

    const validGazeRows = (gazeRows || []).filter(g => (g.quality_score || 0) >= 0.5);
    const gazeStudentIds = new Set(validGazeRows.map(g => g.student_id));

    // Active/Connected student union
    const connectedStudentIds = new Set([
      ...feedbackStudentIds,
      ...testStudentIds,
      ...gazeStudentIds,
    ]);

    const denominators = {
      expectedClassSize,
      connectedStudents: Math.max(connectedStudentIds.size, 1),
      feedbackRespondents: feedbackStudentIds.size,
      testRespondents: testStudentIds.size,
      gazeParticipants: gazeStudentIds.size,
    };

    // 3. Difficulty Assessments & Content Blocks
    const { data: assessments } = await supabaseAdmin
      .from('difficulty_assessments')
      .select('*, content_blocks(id, text, block_type, page_id, document_pages(page_number))')
      .eq('session_id', sessionId)
      .order('difficulty_pct', { ascending: false });

    // 4. Slide-by-Slide Aggregation
    const slideMap = new Map();
    (assessments || []).forEach(a => {
      const pageNum = a.content_blocks?.document_pages?.page_number || 1;
      let slide = slideMap.get(pageNum);
      if (!slide) {
        slide = {
          pageNumber: pageNum,
          totalBlocks: 0,
          detectedBlocks: 0,
          avgDifficultyPct: 0,
          highestDifficultyPct: 0,
          blocks: [],
        };
      }
      slide.totalBlocks++;
      if (a.status === 'difficulty_detected') slide.detectedBlocks++;
      slide.highestDifficultyPct = Math.max(slide.highestDifficultyPct, a.difficulty_pct || 0);
      slide.avgDifficultyPct += a.difficulty_pct || 0;
      slide.blocks.push({
        blockId: a.content_block_id,
        textSnippet: a.content_blocks?.text?.substring(0, 80) || '',
        difficultyPct: a.difficulty_pct,
        status: a.status,
        affectedCount: a.affected_count,
        evidence: a.evidence_sources,
      });
      slideMap.set(pageNum, slide);
    });

    const slideBreakdown = Array.from(slideMap.values()).map(s => ({
      ...s,
      avgDifficultyPct: s.totalBlocks > 0 ? Math.round(s.avgDifficultyPct / s.totalBlocks) : 0,
    })).sort((a, b) => a.pageNumber - b.pageNumber);

    // 5. Overall Comprehension Test Metrics
    const totalAnswers = responseRows.length;
    const correctAnswers = responseRows.filter(r => r.is_correct === true).length;
    const wrongAnswers = responseRows.filter(r => r.is_correct === false).length;
    const avgConfidence = totalAnswers > 0
      ? (responseRows.reduce((sum, r) => sum + (r.confidence_rating || 3), 0) / totalAnswers).toFixed(1)
      : '3.0';

    const comprehensionMetrics = {
      totalTestsLaunched: (testRows || []).length,
      totalResponses: totalAnswers,
      accuracyPct: totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0,
      wrongPct: totalAnswers > 0 ? Math.round((wrongAnswers / totalAnswers) * 100) : 0,
      avgConfidenceRating: parseFloat(avgConfidence),
      confidenceDistribution: {
        low: responseRows.filter(r => r.confidence_rating <= 2).length,
        medium: responseRows.filter(r => r.confidence_rating === 3).length,
        high: responseRows.filter(r => r.confidence_rating >= 4).length,
      },
    };

    // 6. Post-Reiteration Evaluation (Before vs After Comparison)
    const { data: reiterationEvents } = await supabaseAdmin
      .from('reiteration_events')
      .select('*, content_blocks(id, text)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const reiterationEvaluations = (reiterationEvents || []).map(reit => {
      // Find tests associated with this content block before reiteration broadcast
      const blockId = reit.content_block_id;
      const reitTime = new Date(reit.broadcast_at || reit.created_at);

      const blockTests = (testRows || []).filter(t => t.content_block_id === blockId);
      const preTests = blockTests.filter(t => new Date(t.created_at) <= reitTime);
      const postTests = blockTests.filter(t => new Date(t.created_at) > reitTime);

      const preResponses = responseRows.filter(r => preTests.some(t => t.id === r.test_id));
      const postResponses = responseRows.filter(r => postTests.some(t => t.id === r.test_id));

      const preAccuracy = preResponses.length > 0
        ? Math.round((preResponses.filter(r => r.is_correct).length / preResponses.length) * 100)
        : null;

      const postAccuracy = postResponses.length > 0
        ? Math.round((postResponses.filter(r => r.is_correct).length / postResponses.length) * 100)
        : null;

      let resolutionStatus = 'pending_followup';
      if (postAccuracy !== null && preAccuracy !== null) {
        if (postAccuracy >= preAccuracy + 20 || postAccuracy >= 80) resolutionStatus = 'resolved';
        else if (postAccuracy > preAccuracy) resolutionStatus = 'partially_resolved';
        else resolutionStatus = 'needs_further_review';
      } else if (postAccuracy !== null) {
        resolutionStatus = postAccuracy >= 75 ? 'resolved' : 'needs_further_review';
      }

      return {
        reiterationId: reit.id,
        contentBlockId: blockId,
        conceptTextSnippet: reit.content_blocks?.text?.substring(0, 80) || 'Concept',
        status: reit.status,
        affectedAtTrigger: reit.affected_count,
        triggeredAt: reit.created_at,
        broadcastAt: reit.broadcast_at,
        preReiterationAccuracyPct: preAccuracy,
        postReiterationAccuracyPct: postAccuracy,
        resolutionStatus,
      };
    });

    return {
      session: {
        id: session.id,
        className: session.classes?.name,
        subject: session.classes?.subject,
        status: session.status,
        startedAt: session.started_at,
        endedAt: session.ended_at,
      },
      denominators,
      assessmentsSummary: {
        totalAssessed: (assessments || []).length,
        difficultyDetectedCount: (assessments || []).filter(a => a.status === 'difficulty_detected').length,
        needsAttentionCount: (assessments || []).filter(a => a.status === 'needs_attention').length,
        monitoringCount: (assessments || []).filter(a => a.status === 'monitoring').length,
      },
      slideBreakdown,
      comprehensionMetrics,
      reiterationEvaluations,
    };
  }

  /**
   * 15. Individual Student Learning Profile.
   * Separates:
   * - Direct feedback (explicit confusion submissions)
   * - Incorrect comprehension answers (quiz tests)
   * - Inferred difficulty (gaze dwell / return observations)
   * - Reliability & data quality notes
   */
  static async getStudentProfile(sessionId, studentId) {
    // 1. Fetch Student Profile
    const { data: student, error: stuErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', studentId)
      .single();

    if (stuErr || !student) throw new Error('Student not found.');

    // 2. Fetch Consent & Calibration Status
    const { data: consent } = await supabaseAdmin
      .from('student_consents')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_id', sessionId)
      .maybeSingle();

    const { data: calibration } = await supabaseAdmin
      .from('calibration_results')
      .select('*')
      .eq('student_id', studentId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Direct Feedback History
    const { data: feedback } = await supabaseAdmin
      .from('student_feedback')
      .select('*, content_blocks(id, text, document_pages(page_number))')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    // 4. Comprehension Test History
    const { data: responses } = await supabaseAdmin
      .from('comprehension_responses')
      .select('*, comprehension_tests(id, question, options, correct_answer, content_block_id)')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    // 5. Gaze Dwell Observations
    const { data: gazeObs } = await supabaseAdmin
      .from('gaze_observations')
      .select('*, content_blocks(id, text, document_pages(page_number))')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .order('dwell_ms', { ascending: false });

    // 6. Compute Struggle Summaries
    const totalTests = (responses || []).length;
    const correctTests = (responses || []).filter(r => r.is_correct === true).length;
    const accuracyPct = totalTests > 0 ? Math.round((correctTests / totalTests) * 100) : 0;
    const avgConfidence = totalTests > 0
      ? ((responses || []).reduce((s, r) => s + (r.confidence_rating || 3), 0) / totalTests).toFixed(1)
      : '3.0';

    const confusedFlagsCount = (feedback || []).filter(f => f.feedback_type === 'confused').length;
    const questionsCount = (feedback || []).filter(f => f.feedback_type === 'question').length;

    // Reliability & limitations
    const calibrationUsable = calibration?.is_usable ?? false;
    const trackingQuality = consent?.camera_enabled
      ? (calibrationUsable ? `Calibrated (${Math.round((calibration.accuracy_score || 0.8) * 100)}% accuracy)` : 'Uncalibrated / Poor accuracy')
      : 'Camera Disabled (Opted Out)';

    return {
      student: {
        id: student.id,
        fullName: student.full_name || 'Student',
        email: student.email,
        avatarUrl: student.avatar_url,
      },
      trackingStatus: {
        cameraEnabled: Boolean(consent?.camera_enabled),
        calibrationUsable,
        accuracyScore: calibration?.accuracy_score || null,
        qualityDescription: trackingQuality,
      },
      metrics: {
        totalTestsTaken: totalTests,
        accuracyPct,
        avgConfidenceRating: parseFloat(avgConfidence),
        confusedFlagsSent: confusedFlagsCount,
        questionsAsked: questionsCount,
        observedHighDwellBlocks: (gazeObs || []).filter(g => g.dwell_ms > 4000).length,
      },
      evidenceStreams: {
        directFeedback: (feedback || []).map(f => ({
          id: f.id,
          type: f.feedback_type,
          message: f.message,
          slideNumber: f.content_blocks?.document_pages?.page_number || 1,
          conceptSnippet: f.content_blocks?.text?.substring(0, 60) || 'General',
          timestamp: f.created_at,
        })),
        comprehensionTests: (responses || []).map(r => ({
          testId: r.test_id,
          question: r.comprehension_tests?.question,
          selectedAnswer: r.selected_answer,
          correctAnswer: r.comprehension_tests?.correct_answer,
          isCorrect: r.is_correct,
          confidenceRating: r.confidence_rating,
          responseTimeMs: r.response_time_ms,
          timestamp: r.created_at,
        })),
        inferredGazeObservations: (gazeObs || []).map(g => ({
          contentBlockId: g.content_block_id,
          slideNumber: g.content_blocks?.document_pages?.page_number || 1,
          textSnippet: g.content_blocks?.text?.substring(0, 60) || 'Block',
          dwellMs: g.dwell_ms,
          returnCount: g.return_count,
          qualityScore: g.quality_score,
        })),
      },
    };
  }

  /**
   * Student's Personal Learning Portal Insights across sessions.
   */
  static async getStudentPersonalInsights(studentId) {
    // 1. All class memberships
    const { data: memberships } = await supabaseAdmin
      .from('class_members')
      .select('*, classes(*)')
      .eq('student_id', studentId)
      .eq('status', 'active');

    // 2. All comprehension responses
    const { data: responses } = await supabaseAdmin
      .from('comprehension_responses')
      .select('*, comprehension_tests(question, correct_answer, session_id, sessions(classes(name, subject)))')
      .eq('student_id', studentId);

    // 3. Feedback sent
    const { data: feedback } = await supabaseAdmin
      .from('student_feedback')
      .select('*')
      .eq('student_id', studentId);

    const totalTests = (responses || []).length;
    const correctCount = (responses || []).filter(r => r.is_correct === true).length;
    const overallAccuracyPct = totalTests > 0 ? Math.round((correctCount / totalTests) * 100) : 0;

    return {
      classes: (memberships || []).map(m => m.classes),
      summary: {
        totalTestsCompleted: totalTests,
        overallAccuracyPct,
        feedbackCount: (feedback || []).length,
      },
      recentTests: (responses || []).slice(0, 10).map(r => ({
        question: r.comprehension_tests?.question,
        className: r.comprehension_tests?.sessions?.classes?.name,
        isCorrect: r.is_correct,
        confidence: r.confidence_rating,
        date: r.created_at,
      })),
    };
  }

  /**
   * Multi-session Historical Comparison for a Class.
   */
  static async getClassHistoricalSummary(classId) {
    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('id, session_code, status, current_slide_index, started_at, ended_at, created_at')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    const sessionIds = (sessions || []).map(s => s.id);

    let allAssessments = [];
    if (sessionIds.length > 0) {
      const { data: assess } = await supabaseAdmin
        .from('difficulty_assessments')
        .select('*')
        .in('session_id', sessionIds);
      allAssessments = assess || [];
    }

    const sessionHistory = (sessions || []).map(s => {
      const sessAssess = allAssessments.filter(a => a.session_id === s.id);
      const diffCount = sessAssess.filter(a => a.status === 'difficulty_detected').length;
      const avgScore = sessAssess.length > 0
        ? Math.round(sessAssess.reduce((sum, a) => sum + (a.difficulty_pct || 0), 0) / sessAssess.length)
        : 0;

      return {
        sessionId: s.id,
        code: s.session_code,
        status: s.status,
        date: s.started_at || s.created_at,
        assessedBlocks: sessAssess.length,
        difficultyDetectedBlocks: diffCount,
        averageDifficultyPct: avgScore,
      };
    });

    return {
      classId,
      totalSessions: (sessions || []).length,
      history: sessionHistory,
    };
  }
}
