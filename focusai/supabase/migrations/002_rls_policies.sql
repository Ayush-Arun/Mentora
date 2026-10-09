-- ============================================================================
-- FocusAI — Migration 002: Row Level Security Policies
-- Run AFTER 001_initial_schema.sql
-- ============================================================================

-- ─── Enable RLS on all tables ──────────────────────────────────────────────────
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials              ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_consents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaze_observations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprehension_tests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprehension_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_feedback       ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_flags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reiteration_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights            ENABLE ROW LEVEL SECURITY;

-- ─── Helper: is the current user a member of the given class? ─────────────────
CREATE OR REPLACE FUNCTION is_class_member(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_members
    WHERE class_id = p_class_id
      AND student_id = auth.uid()
      AND status = 'active'
  );
$$;

-- Helper: does the current user own (teach) the given class?
CREATE OR REPLACE FUNCTION is_class_teacher(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes
    WHERE id = p_class_id AND teacher_id = auth.uid()
  );
$$;

-- Helper: does the current user own the session's class?
CREATE OR REPLACE FUNCTION is_session_teacher(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM sessions s
    JOIN classes c ON c.id = s.class_id
    WHERE s.id = p_session_id AND c.teacher_id = auth.uid()
  );
$$;

-- Helper: is the current user enrolled in the session's class?
CREATE OR REPLACE FUNCTION is_session_member(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM sessions s
    JOIN class_members cm ON cm.class_id = s.class_id
    WHERE s.id = p_session_id
      AND cm.student_id = auth.uid()
      AND cm.status = 'active'
  );
$$;

-- ─── PROFILES ─────────────────────────────────────────────────────────────────
-- Users can read their own profile.
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Teachers can read profiles of students in their classes.
CREATE POLICY "profiles_select_class_members"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_members cm
      JOIN classes c ON c.id = cm.class_id
      WHERE cm.student_id = profiles.id
        AND c.teacher_id = auth.uid()
    )
  );

-- Users can update their own profile (name, avatar only — role NOT updateable here).
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- INSERT is handled by the server (service role) — no client INSERT policy needed.

-- ─── CLASSES ──────────────────────────────────────────────────────────────────
-- Teachers can CRUD their own classes.
CREATE POLICY "classes_teacher_all"
  ON classes FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Students can read classes they are enrolled in.
CREATE POLICY "classes_student_select"
  ON classes FOR SELECT
  USING (is_class_member(id));

-- ─── CLASS MEMBERS ────────────────────────────────────────────────────────────
-- Teachers can manage members of their own classes.
CREATE POLICY "class_members_teacher_all"
  ON class_members FOR ALL
  USING (is_class_teacher(class_id))
  WITH CHECK (is_class_teacher(class_id));

-- Students can read their own enrollment rows.
CREATE POLICY "class_members_student_select_own"
  ON class_members FOR SELECT
  USING (student_id = auth.uid());

-- Students can insert their own enrollment (join via code — server validates code).
CREATE POLICY "class_members_student_insert_own"
  ON class_members FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- ─── SESSIONS ─────────────────────────────────────────────────────────────────
-- Teachers can CRUD sessions for their own classes.
CREATE POLICY "sessions_teacher_all"
  ON sessions FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Students can read sessions of classes they are enrolled in.
CREATE POLICY "sessions_student_select"
  ON sessions FOR SELECT
  USING (is_session_member(id));

-- ─── MATERIALS ────────────────────────────────────────────────────────────────
CREATE POLICY "materials_teacher_all"
  ON materials FOR ALL
  USING (uploader_id = auth.uid())
  WITH CHECK (uploader_id = auth.uid());

CREATE POLICY "materials_student_select"
  ON materials FOR SELECT
  USING (is_class_member(class_id));

-- ─── DOCUMENT PAGES ───────────────────────────────────────────────────────────
CREATE POLICY "document_pages_teacher_select"
  ON document_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM materials m
      JOIN classes c ON c.id = m.class_id
      WHERE m.id = document_pages.material_id AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY "document_pages_student_select"
  ON document_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM materials m
      WHERE m.id = document_pages.material_id AND is_class_member(m.class_id)
    )
  );

-- ─── CONTENT BLOCKS ───────────────────────────────────────────────────────────
CREATE POLICY "content_blocks_teacher_select"
  ON content_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM materials m
      JOIN classes c ON c.id = m.class_id
      WHERE m.id = content_blocks.material_id AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY "content_blocks_student_select"
  ON content_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM materials m
      WHERE m.id = content_blocks.material_id AND is_class_member(m.class_id)
    )
  );

-- ─── SESSION EVENTS ───────────────────────────────────────────────────────────
CREATE POLICY "session_events_teacher_all"
  ON session_events FOR ALL
  USING (is_session_teacher(session_id));

CREATE POLICY "session_events_student_select"
  ON session_events FOR SELECT
  USING (is_session_member(session_id));

-- Students can insert their own events (feedback, answers).
CREATE POLICY "session_events_student_insert"
  ON session_events FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND is_session_member(session_id)
  );

-- ─── STUDENT CONSENTS ─────────────────────────────────────────────────────────
-- Students manage their own consents.
CREATE POLICY "consents_student_all"
  ON student_consents FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Teachers can read consents for their sessions.
CREATE POLICY "consents_teacher_select"
  ON student_consents FOR SELECT
  USING (is_session_teacher(session_id));

-- ─── CALIBRATION RESULTS ──────────────────────────────────────────────────────
CREATE POLICY "calibration_student_all"
  ON calibration_results FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "calibration_teacher_select"
  ON calibration_results FOR SELECT
  USING (is_session_teacher(session_id));

-- ─── GAZE OBSERVATIONS ────────────────────────────────────────────────────────
-- Students write their own observations.
CREATE POLICY "gaze_student_insert"
  ON gaze_observations FOR INSERT
  WITH CHECK (student_id = auth.uid() AND is_session_member(session_id));

-- Students read their own observations (personal insights).
CREATE POLICY "gaze_student_select_own"
  ON gaze_observations FOR SELECT
  USING (student_id = auth.uid());

-- Teachers read aggregated observations for their sessions (NOT individual-level from other students).
-- Individual student data is only accessible via the analytics service which returns aggregates.
CREATE POLICY "gaze_teacher_select"
  ON gaze_observations FOR SELECT
  USING (is_session_teacher(session_id));

-- ─── COMPREHENSION TESTS ──────────────────────────────────────────────────────
CREATE POLICY "tests_teacher_all"
  ON comprehension_tests FOR ALL
  USING (created_by = auth.uid());

CREATE POLICY "tests_student_select"
  ON comprehension_tests FOR SELECT
  USING (is_session_member(session_id));

-- ─── COMPREHENSION RESPONSES ──────────────────────────────────────────────────
CREATE POLICY "responses_student_all"
  ON comprehension_responses FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "responses_teacher_select"
  ON comprehension_responses FOR SELECT
  USING (is_session_teacher(session_id));

-- ─── STUDENT FEEDBACK ─────────────────────────────────────────────────────────
CREATE POLICY "feedback_student_all"
  ON student_feedback FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "feedback_teacher_select"
  ON student_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN classes c ON c.id = s.class_id
      WHERE s.id = student_feedback.session_id AND c.teacher_id = auth.uid()
    )
  );

-- ─── DIFFICULTY ASSESSMENTS ───────────────────────────────────────────────────
-- Computed by the server (service role). Teachers read; students do NOT.
CREATE POLICY "difficulty_teacher_select"
  ON difficulty_assessments FOR SELECT
  USING (is_session_teacher(session_id));

-- ─── CONTENT FLAGS ────────────────────────────────────────────────────────────
CREATE POLICY "flags_teacher_all"
  ON content_flags FOR ALL
  USING (is_session_teacher(session_id));

-- Students can read flags for sessions they are in.
CREATE POLICY "flags_student_select"
  ON content_flags FOR SELECT
  USING (is_session_member(session_id));

-- ─── REITERATION EVENTS ───────────────────────────────────────────────────────
CREATE POLICY "reiteration_teacher_all"
  ON reiteration_events FOR ALL
  USING (is_session_teacher(session_id));

-- Students see only broadcast reiterations.
CREATE POLICY "reiteration_student_select"
  ON reiteration_events FOR SELECT
  USING (
    is_session_member(session_id) AND status = 'broadcast'
  );

-- ─── AI INSIGHTS ─────────────────────────────────────────────────────────────
-- Teacher reads all insights for their sessions.
CREATE POLICY "ai_insights_teacher_select"
  ON ai_insights FOR SELECT
  USING (is_session_teacher(session_id));

-- Students see teacher-confirmed insights only.
CREATE POLICY "ai_insights_student_select"
  ON ai_insights FOR SELECT
  USING (
    is_session_member(session_id) AND teacher_confirmed = TRUE
  );
