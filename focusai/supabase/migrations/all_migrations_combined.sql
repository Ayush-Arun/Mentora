-- FocusAI Complete Unified Migrations (001 - 004)
-- Paste and execute in Supabase Dashboard -> SQL Editor



-- ============================================================================
-- START OF FILE: 001_initial_schema.sql
-- ============================================================================

-- ============================================================================
-- FocusAI — Migration 001: Initial Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Profiles ──────────────────────────────────────────────────────────────────
-- Extends auth.users — one row per user, created on signup.
-- Role is assigned server-side and stored here. NEVER trust client role claims.
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'One row per Supabase auth user. Role is authoritative here.';
COMMENT ON COLUMN profiles.role IS 'teacher | student — assigned server-side, never from client';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Classes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  class_code      TEXT NOT NULL UNIQUE,  -- e.g. "MTH492" — students join with this
  settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- settings schema (stored as JSONB for flexibility):
  -- { expected_students: int, difficulty_threshold: int,
  --   difficulty_threshold_pct: float|null,
  --   reiteration_auto_approve: bool,
  --   feedback_signals: string[] }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN classes.class_code IS 'Human-readable join code (e.g. MTH492). Unique, 6 chars.';
COMMENT ON COLUMN classes.settings IS 'Threshold, reiteration mode, signal weights — configurable per class.';

CREATE TRIGGER classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Class Members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_members (
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'suspended')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_id, student_id)
);

-- ─── Sessions ─────────────────────────────────────────────────────────────────
-- A live classroom session within a class.
CREATE TABLE IF NOT EXISTS sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'live', 'paused', 'ended')),
  current_slide_index INTEGER NOT NULL DEFAULT 0,
  started_at          TIMESTAMPTZ,
  paused_at           TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Materials ────────────────────────────────────────────────────────────────
-- Uploaded teaching files (PDF, PPTX, notes).
CREATE TABLE IF NOT EXISTS materials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  session_id          UUID REFERENCES sessions(id) ON DELETE SET NULL,
  uploader_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name           TEXT NOT NULL,
  storage_path        TEXT NOT NULL,        -- path in Supabase Storage bucket
  mime_type           TEXT NOT NULL,
  file_size_bytes     BIGINT,
  processing_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  processing_error    TEXT,
  total_pages         INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Document Pages ────────────────────────────────────────────────────────────
-- One row per slide/page of a processed material.
CREATE TABLE IF NOT EXISTS document_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  page_type   TEXT NOT NULL DEFAULT 'slide' CHECK (page_type IN ('slide', 'page', 'section')),
  image_path  TEXT,           -- rendered slide/page image in Storage (for display + vision AI)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, page_number)
);

-- ─── Content Blocks ───────────────────────────────────────────────────────────
-- Paragraph / text block level mapping — the core unit for difficulty tracking.
CREATE TABLE IF NOT EXISTS content_blocks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id         UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  page_id             UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
  block_index         INTEGER NOT NULL,          -- order within the page
  block_type          TEXT NOT NULL DEFAULT 'paragraph'
                        CHECK (block_type IN ('heading', 'paragraph', 'bullet', 'equation', 'caption', 'other')),
  text                TEXT NOT NULL,
  -- bounding box as {x, y, w, h} in normalised 0-1 coordinates relative to page
  bounding_box        JSONB,
  char_offset_start   INTEGER,
  char_offset_end     INTEGER,
  tracking_status     TEXT NOT NULL DEFAULT 'available'
                        CHECK (tracking_status IN ('available', 'unavailable', 'low_confidence')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, page_id, block_index)
);

COMMENT ON COLUMN content_blocks.tracking_status IS
  'available: gaze can be mapped here. unavailable: cannot reliably map gaze (e.g. scanned image). low_confidence: partial OCR.';

-- ─── Session Events ───────────────────────────────────────────────────────────
-- Immutable event log for session state transitions and real-time events.
CREATE TABLE IF NOT EXISTS session_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,   -- e.g. SESSION_STARTED, SLIDE_CHANGED, etc.
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE session_events IS 'Append-only event log. Do not UPDATE or DELETE rows.';

-- ─── Student Consents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_consents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  camera_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  calibration_quality TEXT CHECK (calibration_quality IN ('good', 'acceptable', 'poor', 'not_calibrated')),
  consented_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, session_id)
);

-- ─── Calibration Results ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calibration_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  accuracy_score  FLOAT,          -- mean angular error in degrees or normalised 0-1
  sample_count    INTEGER,
  is_usable       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Gaze Observations ────────────────────────────────────────────────────────
-- Aggregated per-student, per-content-block, per-session observations.
-- RAW webcam frames are NEVER stored. Only derived aggregates.
CREATE TABLE IF NOT EXISTS gaze_observations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content_block_id  UUID NOT NULL REFERENCES content_blocks(id) ON DELETE CASCADE,
  dwell_ms          INTEGER NOT NULL DEFAULT 0,    -- total dwell time
  return_count      INTEGER NOT NULL DEFAULT 0,    -- how many times student returned
  quality_score     FLOAT,                          -- calibration quality at observation time
  sampled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, session_id, content_block_id)
);

COMMENT ON TABLE gaze_observations IS
  'Aggregated gaze signal only — no raw video or frames. quality_score links to calibration accuracy.';

-- ─── Comprehension Tests ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comprehension_tests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content_block_id  UUID REFERENCES content_blocks(id) ON DELETE SET NULL,
  created_by        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question          TEXT NOT NULL,
  options           JSONB,        -- array of { id, text } for MCQ; null for open-ended
  correct_answer    TEXT,         -- option id or null for open-ended
  test_type         TEXT NOT NULL DEFAULT 'mcq'
                      CHECK (test_type IN ('mcq', 'confidence_rating', 'open_ended')),
  source            TEXT NOT NULL DEFAULT 'teacher'
                      CHECK (source IN ('teacher', 'ai_generated')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Comprehension Responses ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comprehension_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id           UUID NOT NULL REFERENCES comprehension_tests(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  selected_answer   TEXT,
  is_correct        BOOLEAN,
  confidence_rating INTEGER CHECK (confidence_rating BETWEEN 1 AND 5),
  response_time_ms  INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (test_id, student_id)  -- one response per student per test
);

-- ─── Student Feedback ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content_block_id  UUID REFERENCES content_blocks(id) ON DELETE SET NULL,
  feedback_type     TEXT NOT NULL CHECK (feedback_type IN ('confused', 'important', 'question', 'clear')),
  message           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Difficulty Assessments ───────────────────────────────────────────────────
-- Computed aggregate difficulty scores per content block per session window.
-- This is the output of the difficulty estimation service, not raw signals.
CREATE TABLE IF NOT EXISTS difficulty_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content_block_id  UUID NOT NULL REFERENCES content_blocks(id) ON DELETE CASCADE,
  affected_count    INTEGER NOT NULL DEFAULT 0,    -- students with difficulty evidence
  eligible_count    INTEGER NOT NULL DEFAULT 0,    -- students with valid observations
  expected_count    INTEGER NOT NULL DEFAULT 0,    -- class expected_students setting
  difficulty_pct    FLOAT NOT NULL DEFAULT 0,      -- affected / eligible * 100
  evidence_sources  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { comprehension_wrong_count, feedback_confused_count, gaze_dwell_count }
  status            TEXT NOT NULL DEFAULT 'insufficient_data'
                      CHECK (status IN ('insufficient_data', 'monitoring', 'needs_attention', 'difficulty_detected')),
  confidence        TEXT NOT NULL DEFAULT 'low'
                      CHECK (confidence IN ('low', 'medium', 'high')),
  window_start      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_end        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, content_block_id)
);

COMMENT ON TABLE difficulty_assessments IS
  'Rule-based aggregate difficulty per content block. affected/eligible/expected denominators are stored separately to avoid metric conflation.';

-- ─── Content Flags ────────────────────────────────────────────────────────────
-- Independent Difficult and Important flags per content block per session.
CREATE TABLE IF NOT EXISTS content_flags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_block_id  UUID NOT NULL REFERENCES content_blocks(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  flag_type         TEXT NOT NULL CHECK (flag_type IN ('difficult', 'important')),
  set_by            TEXT NOT NULL CHECK (set_by IN ('system', 'teacher', 'ai_suggestion')),
  rationale         TEXT,
  confirmed_by_teacher BOOLEAN NOT NULL DEFAULT FALSE,
  teacher_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_block_id, session_id, flag_type)
);

COMMENT ON COLUMN content_flags.flag_type IS
  'difficult and important are INDEPENDENT flags. A block can be both, either, or neither.';

-- ─── Reiteration Events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reiteration_events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content_block_id          UUID NOT NULL REFERENCES content_blocks(id) ON DELETE CASCADE,
  difficulty_assessment_id  UUID REFERENCES difficulty_assessments(id) ON DELETE SET NULL,
  triggered_by              TEXT NOT NULL DEFAULT 'threshold'
                              CHECK (triggered_by IN ('threshold', 'teacher_manual')),
  status                    TEXT NOT NULL DEFAULT 'proposed'
                              CHECK (status IN ('proposed', 'approved', 'dismissed', 'broadcast')),
  ai_explanation            TEXT,          -- raw Gemma output
  teacher_edited_explanation TEXT,         -- what the teacher approved (may differ)
  affected_count            INTEGER,       -- snapshot at trigger time
  eligible_count            INTEGER,
  proposed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at               TIMESTAMPTZ,
  dismissed_at              TIMESTAMPTZ,
  broadcast_at              TIMESTAMPTZ,
  cooldown_until            TIMESTAMPTZ,   -- prevent re-trigger for same block
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reiteration_events IS
  'One row per reiteration proposal. cooldown_until prevents duplicate alerts for the same content block.';

-- ─── AI Insights ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_insights (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID REFERENCES sessions(id) ON DELETE SET NULL,
  material_id       UUID REFERENCES materials(id) ON DELETE SET NULL,
  content_block_id  UUID REFERENCES content_blocks(id) ON DELETE SET NULL,
  insight_type      TEXT NOT NULL
                      CHECK (insight_type IN (
                        'slide_summary', 'important_concepts', 'confusion_sources',
                        'generated_question', 'reiteration', 'difficulty_explanation'
                      )),
  content           TEXT NOT NULL,       -- the AI output
  model_tag         TEXT NOT NULL,       -- e.g. 'gemma4:12b' — logged for auditability
  rationale         TEXT,                -- why the AI flagged this
  teacher_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_insights IS
  'All Gemma outputs stored with model_tag for auditability. Teacher confirmation required before showing students.';


-- ============================================================================
-- START OF FILE: 002_rls_policies.sql
-- ============================================================================

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


-- ============================================================================
-- START OF FILE: 003_storage_buckets.sql
-- ============================================================================

-- ============================================================================
-- FocusAI — Migration 003: Supabase Storage Buckets & Policies
-- Run AFTER 002_rls_policies.sql
-- ============================================================================

-- ─── Create Private Materials Bucket ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials',
  'materials',
  FALSE,   -- PRIVATE — no public URL access
  52428800, -- 50 MB limit
  ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ─── Storage Policies: materials bucket ───────────────────────────────────────

-- Teachers can upload materials for their own classes.
CREATE POLICY "materials_storage_teacher_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'materials'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- Teachers can read/download their own uploaded materials.
CREATE POLICY "materials_storage_teacher_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'materials'
    AND auth.uid() IS NOT NULL
    -- Path format: materials/{class_id}/{file_name}
    -- Verify teacher owns the class_id from the path
    AND EXISTS (
      SELECT 1 FROM classes
      WHERE id::TEXT = (storage.foldername(name))[1]
        AND teacher_id = auth.uid()
    )
  );

-- Students can read materials from classes they are enrolled in.
CREATE POLICY "materials_storage_student_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'materials'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM class_members cm
      WHERE cm.class_id::TEXT = (storage.foldername(name))[1]
        AND cm.student_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- Teachers can delete their own uploaded materials.
CREATE POLICY "materials_storage_teacher_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'materials'
    AND EXISTS (
      SELECT 1 FROM classes
      WHERE id::TEXT = (storage.foldername(name))[1]
        AND teacher_id = auth.uid()
    )
  );

-- ─── Rendered Slides Bucket (page images for display) ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'slide-renders',
  'slide-renders',
  FALSE,    -- Private — served via signed URLs
  10485760, -- 10 MB per image
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Server (service role) writes slide renders; class members can read.
CREATE POLICY "slide_renders_student_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'slide-renders'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM class_members cm
      WHERE cm.class_id::TEXT = (storage.foldername(name))[1]
        AND cm.student_id = auth.uid()
        AND cm.status = 'active'
    )
  );

CREATE POLICY "slide_renders_teacher_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'slide-renders'
    AND EXISTS (
      SELECT 1 FROM classes
      WHERE id::TEXT = (storage.foldername(name))[1]
        AND teacher_id = auth.uid()
    )
  );


-- ============================================================================
-- START OF FILE: 004_indexes.sql
-- ============================================================================

-- ============================================================================
-- FocusAI — Migration 004: Indexes for Performance
-- Run AFTER 003_storage_buckets.sql
-- ============================================================================

-- ─── profiles ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ─── classes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_classes_teacher    ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_code       ON classes(class_code);  -- join lookup

-- ─── class_members ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_members_class      ON class_members(class_id);
CREATE INDEX IF NOT EXISTS idx_members_student    ON class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_members_status     ON class_members(status);

-- ─── sessions ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_class     ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher   ON sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status    ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created   ON sessions(created_at DESC);

-- ─── materials ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_materials_class    ON materials(class_id);
CREATE INDEX IF NOT EXISTS idx_materials_session  ON materials(session_id);
CREATE INDEX IF NOT EXISTS idx_materials_status   ON materials(processing_status);

-- ─── document_pages ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pages_material     ON document_pages(material_id);

-- ─── content_blocks ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_blocks_material    ON content_blocks(material_id);
CREATE INDEX IF NOT EXISTS idx_blocks_page        ON content_blocks(page_id);

-- ─── session_events ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_session     ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type        ON session_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created     ON session_events(created_at DESC);

-- ─── gaze_observations ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gaze_student       ON gaze_observations(student_id);
CREATE INDEX IF NOT EXISTS idx_gaze_session       ON gaze_observations(session_id);
CREATE INDEX IF NOT EXISTS idx_gaze_block         ON gaze_observations(content_block_id);

-- ─── comprehension_responses ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_responses_test     ON comprehension_responses(test_id);
CREATE INDEX IF NOT EXISTS idx_responses_student  ON comprehension_responses(student_id);
CREATE INDEX IF NOT EXISTS idx_responses_session  ON comprehension_responses(session_id);

-- ─── student_feedback ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_feedback_student   ON student_feedback(student_id);
CREATE INDEX IF NOT EXISTS idx_feedback_session   ON student_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_block     ON student_feedback(content_block_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type      ON student_feedback(feedback_type);

-- ─── difficulty_assessments ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_difficulty_session ON difficulty_assessments(session_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_block   ON difficulty_assessments(content_block_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_status  ON difficulty_assessments(status);

-- ─── content_flags ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_flags_session      ON content_flags(session_id);
CREATE INDEX IF NOT EXISTS idx_flags_block        ON content_flags(content_block_id);
CREATE INDEX IF NOT EXISTS idx_flags_type         ON content_flags(flag_type);

-- ─── reiteration_events ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reiteration_session ON reiteration_events(session_id);
CREATE INDEX IF NOT EXISTS idx_reiteration_status  ON reiteration_events(status);

-- ─── ai_insights ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_insights_session   ON ai_insights(session_id);
CREATE INDEX IF NOT EXISTS idx_insights_type      ON ai_insights(insight_type);
