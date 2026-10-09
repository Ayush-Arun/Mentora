/**
 * FocusAI — Session Service
 * Manages live classroom state, authoritative slide synchronization,
 * and live student feedback streams.
 */
import { supabaseAdmin } from '../supabase.js';

export class SessionService {
  /**
   * Create a new classroom session for a class.
   */
  static async createSession({ classId, teacherId, settings = {} }) {
    // Verify teacher owns the class
    const { data: cls, error: clsErr } = await supabaseAdmin
      .from('classes')
      .select('id, teacher_id')
      .eq('id', classId)
      .single();

    if (clsErr || !cls) {
      throw new Error('Class not found.');
    }
    if (cls.teacher_id !== teacherId) {
      const err = new Error('Only the class teacher can create a session.');
      err.status = 403;
      throw err;
    }

    const { data: session, error: sessErr } = await supabaseAdmin
      .from('sessions')
      .insert({
        class_id: classId,
        teacher_id: teacherId,
        status: 'pending',
        current_slide_index: 0,
        settings,
      })
      .select()
      .single();

    if (sessErr) {
      throw new Error(`Failed to create session: ${sessErr.message}`);
    }

    // Log event
    await supabaseAdmin.from('session_events').insert({
      session_id: session.id,
      event_type: 'SESSION_CREATED',
      payload: { class_id: classId, settings },
      created_by: teacherId,
    });

    return session;
  }

  /**
   * Start a session (moves from pending/paused to live).
   */
  static async startSession(sessionId, teacherId) {
    const session = await this.verifyTeacherOwnership(sessionId, teacherId);

    const { data: updated, error } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'live',
        started_at: session.started_at || new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to start session: ${error.message}`);

    await supabaseAdmin.from('session_events').insert({
      session_id: sessionId,
      event_type: 'SESSION_STARTED',
      payload: { started_at: updated.started_at },
      created_by: teacherId,
    });

    return updated;
  }

  /**
   * Teacher changes authoritative slide.
   * Persists slide index and logs SLIDE_CHANGED event.
   */
  static async updateSlide(sessionId, teacherId, slideIndex) {
    await this.verifyTeacherOwnership(sessionId, teacherId);

    const index = parseInt(slideIndex, 10);
    if (isNaN(index) || index < 0) {
      const err = new Error('Invalid slide index.');
      err.status = 400;
      throw err;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('sessions')
      .update({
        current_slide_index: index,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update slide: ${error.message}`);

    // Insert authoritative event
    await supabaseAdmin.from('session_events').insert({
      session_id: sessionId,
      event_type: 'SLIDE_CHANGED',
      payload: { slide_index: index },
      created_by: teacherId,
    });

    return updated;
  }

  /**
   * Update session status (live, paused, ended).
   */
  static async updateStatus(sessionId, teacherId, status) {
    const valid = ['live', 'paused', 'ended'];
    if (!valid.includes(status)) {
      const err = new Error(`Invalid status: ${status}. Must be one of ${valid.join(', ')}`);
      err.status = 400;
      throw err;
    }

    await this.verifyTeacherOwnership(sessionId, teacherId);

    const updates = { status };
    if (status === 'paused') updates.paused_at = new Date().toISOString();
    if (status === 'ended') updates.ended_at = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from('sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update session status: ${error.message}`);

    const eventType = status === 'paused'
      ? 'SESSION_PAUSED'
      : status === 'ended'
      ? 'SESSION_ENDED'
      : 'SESSION_RESUMED';

    await supabaseAdmin.from('session_events').insert({
      session_id: sessionId,
      event_type: eventType,
      payload: { status },
      created_by: teacherId,
    });

    return updated;
  }

  /**
   * Fetch session details for an authorized user (teacher or enrolled student).
   */
  static async getSession(sessionId, userId, userRole) {
    const { data: session, error: sessErr } = await supabaseAdmin
      .from('sessions')
      .select('*, classes(id, name, subject, teacher_id, settings)')
      .eq('id', sessionId)
      .single();

    if (sessErr || !session) {
      throw new Error('Session not found.');
    }

    // Verify access
    if (userRole === 'teacher') {
      if (session.teacher_id !== userId) {
        const err = new Error('Forbidden: You do not own this session.');
        err.status = 403;
        throw err;
      }
    } else {
      // Check enrollment
      const { data: member } = await supabaseAdmin
        .from('class_members')
        .select('status')
        .eq('class_id', session.class_id)
        .eq('student_id', userId)
        .single();

      if (!member || member.status !== 'active') {
        const err = new Error('Forbidden: You are not enrolled in this class.');
        err.status = 403;
        throw err;
      }
    }

    // Load active or latest material for this class/session
    const { data: materials } = await supabaseAdmin
      .from('materials')
      .select('*')
      .eq('class_id', session.class_id)
      .eq('processing_status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1);

    let activeMaterial = null;
    if (materials && materials.length > 0) {
      const mat = materials[0];
      const { data: pages } = await supabaseAdmin
        .from('document_pages')
        .select('*')
        .eq('material_id', mat.id)
        .order('page_number', { ascending: true });

      const { data: blocks } = await supabaseAdmin
        .from('content_blocks')
        .select('*')
        .eq('material_id', mat.id)
        .order('block_index', { ascending: true });

      activeMaterial = {
        ...mat,
        pages: (pages || []).map(p => ({
          ...p,
          blocks: (blocks || []).filter(b => b.page_id === p.id),
        })),
      };
    }

    return {
      session,
      material: activeMaterial,
    };
  }

  /**
   * Submit live student feedback (confusion, questions, notes on content block).
   */
  static async submitFeedback(sessionId, studentId, { contentBlockId = null, feedbackType, message = '' }) {
    const valid = ['confused', 'important', 'question', 'clear'];
    if (!valid.includes(feedbackType)) {
      const err = new Error(`Invalid feedback_type: ${feedbackType}`);
      err.status = 400;
      throw err;
    }

    // Check enrollment
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('class_id')
      .eq('id', sessionId)
      .single();

    if (!session) throw new Error('Session not found.');

    const { data: member } = await supabaseAdmin
      .from('class_members')
      .select('status')
      .eq('class_id', session.class_id)
      .eq('student_id', studentId)
      .single();

    if (!member || member.status !== 'active') {
      const err = new Error('Student is not enrolled in this session class.');
      err.status = 403;
      throw err;
    }

    const { data: fb, error: fbErr } = await supabaseAdmin
      .from('student_feedback')
      .insert({
        session_id: sessionId,
        student_id: studentId,
        content_block_id: contentBlockId,
        feedback_type: feedbackType,
        message,
      })
      .select()
      .single();

    if (fbErr) throw new Error(`Failed to submit feedback: ${fbErr.message}`);

    // Append to session events
    await supabaseAdmin.from('session_events').insert({
      session_id: sessionId,
      event_type: 'STUDENT_FEEDBACK',
      payload: {
        feedback_type: feedbackType,
        content_block_id: contentBlockId,
        message,
      },
      created_by: studentId,
    });

    return fb;
  }

  /**
   * Get feedback summary and recent items for teacher live view.
   */
  static async getFeedbackSummary(sessionId, teacherId) {
    await this.verifyTeacherOwnership(sessionId, teacherId);

    const { data: feedback, error } = await supabaseAdmin
      .from('student_feedback')
      .select('id, feedback_type, message, content_block_id, created_at, profiles(full_name)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`Failed to load feedback: ${error.message}`);

    const counts = {
      confused: 0,
      important: 0,
      question: 0,
      clear: 0,
    };

    (feedback || []).forEach(f => {
      if (counts[f.feedback_type] !== undefined) {
        counts[f.feedback_type]++;
      }
    });

    return {
      counts,
      recent: feedback || [],
    };
  }

  /**
   * Retrieve session events for live polling/stream.
   */
  static async getSessionEvents(sessionId, sinceTimestamp = null) {
    let query = supabaseAdmin
      .from('session_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (sinceTimestamp) {
      query = query.gt('created_at', sinceTimestamp);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load session events: ${error.message}`);
    return data || [];
  }

  /**
   * Helper: verify teacher owns the session.
   */
  static async verifyTeacherOwnership(sessionId, teacherId) {
    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      throw new Error('Session not found.');
    }
    if (session.teacher_id !== teacherId) {
      const err = new Error('Forbidden: You do not own this session.');
      err.status = 403;
      throw err;
    }
    return session;
  }
}
