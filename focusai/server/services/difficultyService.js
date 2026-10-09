/**
 * FocusAI — Multimodal Difficulty Estimation Service (Phase 4)
 *
 * Combines independent evidence streams:
 * 1. Comprehension Test Results (wrong answer rate)
 * 2. Explicit Student Feedback ('confused' submissions)
 * 3. Gaze Dwell & Return Observations (filtered by calibration quality)
 *
 * Generates transparent rule-based difficulty assessments and manages
 * class-level threshold triggers for live teaching reiterations.
 */
import { supabaseAdmin } from '../supabase.js';
import { generateAlternativeExplanations } from './aiService.js';

export class DifficultyService {
  /**
   * Compute difficulty score and evidence for a specific content block.
   */
  static async computeBlockDifficulty(sessionId, contentBlockId) {
    // 1. Get session details for expected student denominator
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('sessions')
      .select('id, class_id, settings, classes(settings)')
      .eq('id', sessionId)
      .single();

    if (sessErr || !session) throw new Error('Session not found.');

    const thresholdSettings = session.settings?.threshold || session.classes?.settings?.threshold || {
      mode: 'percentage', // 'count' or 'percentage'
      value: 25,          // 25% or count (e.g. 10)
      requireApproval: true,
      cooldownSeconds: 180,
    };

    // Total enrolled/active students in the class
    const { count: enrolledCount } = await supabaseAdmin
      .from('class_members')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', session.class_id)
      .eq('status', 'active');

    const expectedCount = Math.max(1, enrolledCount || 1);

    // 2. Evidence 1: Comprehension Tests for this block
    const { data: tests } = await supabaseAdmin
      .from('comprehension_tests')
      .select('id')
      .eq('session_id', sessionId)
      .eq('content_block_id', contentBlockId);

    const testIds = (tests || []).map(t => t.id);
    let compTotal = 0;
    let compWrong = 0;

    if (testIds.length > 0) {
      const { data: responses } = await supabaseAdmin
        .from('comprehension_responses')
        .select('is_correct, student_id')
        .in('test_id', testIds);

      if (responses && responses.length > 0) {
        compTotal = responses.length;
        compWrong = responses.filter(r => r.is_correct === false).length;
      }
    }

    // 3. Evidence 2: Student Confusion Feedback for this block
    const { data: feedback } = await supabaseAdmin
      .from('student_feedback')
      .select('id, student_id, feedback_type')
      .eq('session_id', sessionId)
      .eq('content_block_id', contentBlockId)
      .eq('feedback_type', 'confused');

    // Distinct confused students
    const confusedStudentIds = new Set((feedback || []).map(f => f.student_id));
    const confusedCount = confusedStudentIds.size;

    // 4. Evidence 3: Gaze Dwell & Return Observations
    const { data: gazeObs } = await supabaseAdmin
      .from('gaze_observations')
      .select('student_id, dwell_ms, return_count, quality_score')
      .eq('session_id', sessionId)
      .eq('content_block_id', contentBlockId);

    // Filter by calibration quality >= 0.5
    const validGaze = (gazeObs || []).filter(g => (g.quality_score || 0) >= 0.5);
    const validGazeStudentIds = new Set(validGaze.map(g => g.student_id));
    const highDwellStudents = new Set(validGaze.filter(g => g.dwell_ms > 4000 || g.return_count >= 2).map(g => g.student_id));

    const gazeEligible = validGazeStudentIds.size;
    const gazeAffected = highDwellStudents.size;

    // 5. Eligible & Affected Unions
    const eligibleStudentIds = new Set([
      ...confusedStudentIds,
      ...validGazeStudentIds,
    ]);
    if (compTotal > 0) {
      // Add test respondents
      const { data: respondents } = await supabaseAdmin
        .from('comprehension_responses')
        .select('student_id')
        .in('test_id', testIds);
      (respondents || []).forEach(r => eligibleStudentIds.add(r.student_id));
    }

    const eligibleCount = Math.max(1, eligibleStudentIds.size);

    // Affected student union (students showing difficulty in at least one stream)
    const affectedStudentIds = new Set([
      ...confusedStudentIds,
      ...highDwellStudents,
    ]);
    if (compWrong > 0) {
      const { data: wrongRespondents } = await supabaseAdmin
        .from('comprehension_responses')
        .select('student_id')
        .in('test_id', testIds)
        .eq('is_correct', false);
      (wrongRespondents || []).forEach(r => affectedStudentIds.add(r.student_id));
    }

    const affectedCount = affectedStudentIds.size;

    // 6. Transparent Multimodal Scoring
    let compRate = compTotal > 0 ? (compWrong / compTotal) : 0;
    let confRate = confusedCount / eligibleCount;
    let gazeRate = gazeEligible > 0 ? (gazeAffected / gazeEligible) : 0;

    let score = 0;
    if (gazeEligible > 0 && compTotal > 0) {
      score = (compRate * 0.50) + (confRate * 0.30) + (gazeRate * 0.20);
    } else if (compTotal > 0) {
      score = (compRate * 0.60) + (confRate * 0.40);
    } else if (gazeEligible > 0) {
      score = (confRate * 0.65) + (gazeRate * 0.35);
    } else {
      score = confRate;
    }

    const difficultyPct = Math.round(score * 100);

    // 7. Status & Confidence Classification
    let status = 'insufficient_data';
    if (eligibleCount >= 1 || compTotal > 0) {
      if (score >= 0.40) status = 'difficulty_detected';
      else if (score >= 0.20) status = 'needs_attention';
      else status = 'monitoring';
    }

    let confidence = 'low';
    if (eligibleCount >= 5 && (compTotal > 0 || gazeEligible > 0)) confidence = 'high';
    else if (eligibleCount >= 2) confidence = 'medium';

    const evidenceSources = {
      comprehension: { total: compTotal, wrong: compWrong, rate: Math.round(compRate * 100) },
      feedback: { confused: confusedCount, rate: Math.round(confRate * 100) },
      gaze: { eligible: gazeEligible, highDwell: gazeAffected, rate: Math.round(gazeRate * 100) },
    };

    // 8. Persist Difficulty Assessment
    const { data: assessment, error: assessErr } = await supabaseAdmin
      .from('difficulty_assessments')
      .upsert({
        session_id: sessionId,
        content_block_id: contentBlockId,
        affected_count: affectedCount,
        eligible_count: eligibleCount,
        expected_count: expectedCount,
        difficulty_pct: difficultyPct,
        evidence_sources: evidenceSources,
        status,
        confidence,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_id,content_block_id' })
      .select()
      .single();

    if (assessErr) throw assessErr;

    // 9. Update Content Flags (Difficult Flag)
    if (status === 'difficulty_detected') {
      await supabaseAdmin.from('content_flags').upsert({
        content_block_id: contentBlockId,
        session_id: sessionId,
        flag_type: 'difficult',
        set_by: 'system',
        rationale: `Multimodal difficulty score ${difficultyPct}% (${affectedCount}/${eligibleCount} students affected)`,
        confirmed_by_teacher: false,
      }, { onConflict: 'content_block_id,session_id,flag_type' });
    }

    // 10. Check Group Threshold & Propose Reiteration
    let reiterationProposed = false;
    let thresholdExceeded = false;

    if (thresholdSettings.mode === 'count') {
      thresholdExceeded = affectedCount >= thresholdSettings.value;
    } else {
      const affectedRatio = (affectedCount / expectedCount) * 100;
      thresholdExceeded = affectedRatio >= thresholdSettings.value;
    }

    if (thresholdExceeded && status === 'difficulty_detected') {
      reiterationProposed = await this.triggerReiterationProposal(
        sessionId,
        contentBlockId,
        assessment,
        thresholdSettings
      );
    }

    return {
      assessment,
      score,
      difficultyPct,
      affectedCount,
      eligibleCount,
      expectedCount,
      status,
      confidence,
      evidenceSources,
      reiterationProposed,
    };
  }

  /**
   * Check cooldown and propose an AI-assisted reiteration.
   */
  static async triggerReiterationProposal(sessionId, contentBlockId, assessment, settings) {
    const now = new Date();

    // Check existing active or in-cooldown reiteration
    const { data: existing } = await supabaseAdmin
      .from('reiteration_events')
      .select('*')
      .eq('session_id', sessionId)
      .eq('content_block_id', contentBlockId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const last = existing[0];
      if (last.cooldown_until && new Date(last.cooldown_until) > now) {
        return false; // Still in cooldown
      }
      if (last.status === 'proposed') {
        return false; // Already pending teacher action
      }
    }

    // Fetch content block text
    const { data: block } = await supabaseAdmin
      .from('content_blocks')
      .select('text')
      .eq('id', contentBlockId)
      .single();

    const blockText = block?.text || 'Classroom concept';

    // Generate 3 alternative explanations
    const aiRes = await generateAlternativeExplanations({
      sessionId,
      contentBlockId,
      conceptText: blockText,
      studentConfusionNotes: `${assessment.affected_count} students showed difficulty (${assessment.difficulty_pct}%)`,
    });

    const cooldownUntil = new Date(now.getTime() + (settings.cooldownSeconds || 180) * 1000).toISOString();

    const { data: event, error: evErr } = await supabaseAdmin
      .from('reiteration_events')
      .insert({
        session_id: sessionId,
        content_block_id: contentBlockId,
        difficulty_assessment_id: assessment.id,
        triggered_by: 'threshold',
        status: settings.requireApproval ? 'proposed' : 'broadcast',
        ai_explanation: JSON.stringify(aiRes.alternatives),
        affected_count: assessment.affected_count,
        eligible_count: assessment.eligible_count,
        cooldown_until: cooldownUntil,
        broadcast_at: settings.requireApproval ? null : now.toISOString(),
      })
      .select()
      .single();

    if (!evErr && event) {
      // Log session event for realtime dispatch
      await supabaseAdmin.from('session_events').insert({
        session_id: sessionId,
        event_type: settings.requireApproval ? 'REITERATION_PROPOSED' : 'REITERATION_BROADCAST',
        payload: {
          reiteration_id: event.id,
          content_block_id: contentBlockId,
          affected_count: assessment.affected_count,
          difficulty_pct: assessment.difficulty_pct,
          alternatives: aiRes.alternatives,
        },
      });
      return true;
    }

    return false;
  }

  /**
   * Get all live difficulty assessments for active session.
   */
  static async getSessionAssessments(sessionId) {
    const { data, error } = await supabaseAdmin
      .from('difficulty_assessments')
      .select('*, content_blocks(id, text, block_type, page_id)')
      .eq('session_id', sessionId)
      .order('difficulty_pct', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
