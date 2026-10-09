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
