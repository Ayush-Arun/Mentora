/**
 * FocusAI — Class Service
 *
 * Manages class creation, enrollment, membership, and class-code joining.
 * All mutations go through the service-role client for reliable FK enforcement.
 * RLS policies in Supabase enforce access at the DB layer as a second defence.
 */
import { randomBytes } from 'crypto';
import { supabaseAdmin, dbQuery } from '../supabase.js';

/**
 * Generate a human-readable, collision-resistant 6-char class code.
 * Format: 3 uppercase letters + 3 digits, e.g. "MTH492"
 */
function generateClassCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
  const digits = '0123456789';
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 3; i++) code += letters[bytes[i] % letters.length];
  for (let i = 3; i < 6; i++) code += digits[bytes[i] % digits.length];
  return code;
}

export class ClassService {
  /**
   * Create a new class (teacher only).
   * @param {string} teacherId - UUID of the teacher (from req.userId)
   * @param {{ name: string, subject: string, expectedStudents?: number }} data
   */
  static async createClass(teacherId, { name, subject, expectedStudents = 30 }) {
    if (!name?.trim() || !subject?.trim()) {
      throw { status: 400, code: 'validation_error', message: 'Class name and subject are required.' };
    }

    // Generate a unique class code (retry on collision)
    let classCode;
    let attempts = 0;
    while (attempts < 5) {
      classCode = generateClassCode();
      const { data: existing } = await supabaseAdmin
        .from('classes')
        .select('id')
        .eq('class_code', classCode)
        .single();
      if (!existing) break;
      attempts++;
    }

    const { data: newClass, error } = await supabaseAdmin
      .from('classes')
      .insert({
        teacher_id: teacherId,
        name: name.trim(),
        subject: subject.trim(),
        class_code: classCode,
        settings: {
          expected_students: parseInt(expectedStudents, 10) || 30,
          difficulty_threshold: 11,          // default: trigger when >10 students affected
          difficulty_threshold_pct: null,    // percentage-based alternative (optional)
          reiteration_auto_approve: false,   // teacher approval required by default
          feedback_signals: ['comprehension', 'student_feedback', 'gaze'],
        },
      })
      .select()
      .single();

    if (error) throw { status: 500, code: 'class_creation_failed', message: error.message };

    return newClass;
  }

  /**
   * List all classes for a teacher.
   */
  static async listTeacherClasses(teacherId) {
    const { data, error } = await supabaseAdmin
      .from('classes')
      .select(`
        id, name, subject, class_code, settings, created_at,
        class_members ( count )
      `)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (error) throw { status: 500, code: 'db_error', message: error.message };
    return data || [];
  }

  /**
   * Get a single class with its members. Teacher must own it.
   */
  static async getClass(classId, teacherId) {
    const { data, error } = await supabaseAdmin
      .from('classes')
      .select(`
        id, name, subject, class_code, settings, created_at,
        class_members (
          student_id, status, enrolled_at,
          profiles ( full_name, avatar_url )
        )
      `)
      .eq('id', classId)
      .eq('teacher_id', teacherId)
      .single();

    if (error || !data) {
      throw { status: 404, code: 'class_not_found', message: 'Class not found or access denied.' };
    }
    return data;
  }

  /**
   * Update class settings (threshold, reiteration mode, etc.)
   * Teacher only, own class.
   */
  static async updateClassSettings(classId, teacherId, settings) {
    // First fetch existing settings to merge (partial update)
    const { data: existing } = await supabaseAdmin
      .from('classes')
      .select('settings')
      .eq('id', classId)
      .eq('teacher_id', teacherId)
      .single();

    if (!existing) {
      throw { status: 404, code: 'class_not_found', message: 'Class not found or access denied.' };
    }

    const merged = { ...(existing.settings || {}), ...settings };

    const { data, error } = await supabaseAdmin
      .from('classes')
      .update({ settings: merged })
      .eq('id', classId)
      .eq('teacher_id', teacherId)
      .select()
      .single();

    if (error) throw { status: 500, code: 'update_failed', message: error.message };
    return data;
  }

  /**
   * Student joins a class via class_code.
   * Prevents duplicate enrollment.
   */
  static async joinClass(studentId, classCode) {
    if (!classCode?.trim()) {
      throw { status: 400, code: 'missing_class_code', message: 'Class code is required.' };
    }

    // Find class by code
    const { data: cls, error: clsErr } = await supabaseAdmin
      .from('classes')
      .select('id, name, subject')
      .eq('class_code', classCode.trim().toUpperCase())
      .single();

    if (clsErr || !cls) {
      throw { status: 404, code: 'invalid_class_code', message: 'No class found with that code. Check with your teacher.' };
    }

    // Check for existing enrollment
    const { data: existing } = await supabaseAdmin
      .from('class_members')
      .select('status')
      .eq('class_id', cls.id)
      .eq('student_id', studentId)
      .single();

    if (existing) {
      if (existing.status === 'active') {
        throw { status: 409, code: 'already_enrolled', message: 'You are already enrolled in this class.' };
      }
      // Re-activate if previously removed
      const { error } = await supabaseAdmin
        .from('class_members')
        .update({ status: 'active', enrolled_at: new Date().toISOString() })
        .eq('class_id', cls.id)
        .eq('student_id', studentId);
      if (error) throw { status: 500, code: 'enrollment_failed', message: error.message };
    } else {
      // New enrollment
      const { error } = await supabaseAdmin
        .from('class_members')
        .insert({
          class_id: cls.id,
          student_id: studentId,
          status: 'active',
        });
      if (error) throw { status: 500, code: 'enrollment_failed', message: error.message };
    }

    return {
      class_id: cls.id,
      class_name: cls.name,
      subject: cls.subject,
      message: `Successfully joined "${cls.name}".`,
    };
  }

  /**
   * List classes a student is enrolled in.
   */
  static async listStudentClasses(studentId) {
    const { data, error } = await supabaseAdmin
      .from('class_members')
      .select(`
        class_id, status, enrolled_at,
        classes (
          id, name, subject, class_code, created_at,
          profiles!classes_teacher_id_fkey ( full_name )
        )
      `)
      .eq('student_id', studentId)
      .eq('status', 'active')
      .order('enrolled_at', { ascending: false });

    if (error) throw { status: 500, code: 'db_error', message: error.message };
    return (data || []).map(m => ({
      ...m.classes,
      teacher_name: m.classes?.profiles?.full_name || 'Unknown',
      enrolled_at: m.enrolled_at,
    }));
  }

  /**
   * Remove a student from a class (teacher action).
   */
  static async removeStudent(classId, teacherId, studentId) {
    // Verify teacher owns the class
    const { data: cls } = await supabaseAdmin
      .from('classes')
      .select('id')
      .eq('id', classId)
      .eq('teacher_id', teacherId)
      .single();
    if (!cls) throw { status: 403, code: 'forbidden', message: 'Access denied.' };

    const { error } = await supabaseAdmin
      .from('class_members')
      .update({ status: 'removed' })
      .eq('class_id', classId)
      .eq('student_id', studentId);

    if (error) throw { status: 500, code: 'remove_failed', message: error.message };
    return { message: 'Student removed from class.' };
  }
}
