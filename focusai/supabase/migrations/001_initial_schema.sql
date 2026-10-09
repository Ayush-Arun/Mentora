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
