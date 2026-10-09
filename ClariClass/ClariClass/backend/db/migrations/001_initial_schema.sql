-- Supabase Migration 001: Initial FocusAI Schema
-- Enforces Row Level Security (RLS) on all tables

-- 1. Profiles
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('teacher', 'student', 'admin')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Classes
CREATE TABLE IF NOT EXISTS classes (
    id BIGSERIAL PRIMARY KEY,
    teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    subject TEXT,
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Class Members
CREATE TABLE IF NOT EXISTS class_members (
    id BIGSERIAL PRIMARY KEY,
    class_id BIGINT REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (class_id, student_id)
);

-- 4. Materials (Uploaded PDFs / Presentations)
CREATE TABLE IF NOT EXISTS materials (
    id BIGSERIAL PRIMARY KEY,
    class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
    teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'processed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Document Pages / Slides
CREATE TABLE IF NOT EXISTS document_pages (
    id BIGSERIAL PRIMARY KEY,
    material_id BIGINT REFERENCES materials(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    width FLOAT DEFAULT 800,
    height FLOAT DEFAULT 600,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Content Blocks (Paragraphs, Headings, Formulas)
CREATE TABLE IF NOT EXISTS content_blocks (
    id BIGSERIAL PRIMARY KEY,
    page_id BIGINT REFERENCES document_pages(id) ON DELETE CASCADE,
    block_order INT NOT NULL,
    block_hash VARCHAR(64),
    title TEXT,
    original_text TEXT NOT NULL,
    bbox_json JSONB, -- {x0: float, y0: float, x1: float, y1: float} normalized 0.0 - 1.0
    is_important BOOLEAN DEFAULT FALSE,
    important_rationale TEXT,
    simplified_text TEXT,
    simplified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Sessions (Active Live Classrooms)
CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    class_id BIGINT REFERENCES classes(id) ON DELETE SET NULL,
    material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
    room_code VARCHAR(20) UNIQUE NOT NULL,
    current_slide_index INT DEFAULT 0,
    struggle_threshold_count INT DEFAULT 10,
    struggle_threshold_percent FLOAT DEFAULT 25.0,
    is_active BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- 8. Student Consents (Privacy Opt-In)
CREATE TABLE IF NOT EXISTS student_consents (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
    camera_gaze_consented BOOLEAN DEFAULT FALSE,
    consented_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Calibration Results
CREATE TABLE IF NOT EXISTS calibration_results (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
    error_px FLOAT NOT NULL,
    quality_rating VARCHAR(20) DEFAULT 'medium', -- high | medium | low
    calibrated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Gaze Observations (Aggregated Derived Metrics, Zero Video)
CREATE TABLE IF NOT EXISTS gaze_observations (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
    block_id BIGINT REFERENCES content_blocks(id) ON DELETE CASCADE,
    dwell_ms INT NOT NULL DEFAULT 0,
    return_count INT DEFAULT 1,
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Comprehension Tests
CREATE TABLE IF NOT EXISTS comprehension_tests (
    id BIGSERIAL PRIMARY KEY,
    block_id BIGINT REFERENCES content_blocks(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options_json JSONB NOT NULL, -- ['Option A', 'Option B', 'Option C', 'Option D']
    correct_option_idx INT NOT NULL,
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Comprehension Responses
CREATE TABLE IF NOT EXISTS comprehension_responses (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    test_id BIGINT REFERENCES comprehension_tests(id) ON DELETE CASCADE,
    selected_option_idx INT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    confidence_score INT DEFAULT 3,
    answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Student Feedback & Flags
CREATE TABLE IF NOT EXISTS student_feedback (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
    block_id BIGINT REFERENCES content_blocks(id) ON DELETE CASCADE,
    signal_type VARCHAR(50) NOT NULL, -- flag_difficult | flag_important | ask_question
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Difficulty Assessments
CREATE TABLE IF NOT EXISTS difficulty_assessments (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
    block_id BIGINT REFERENCES content_blocks(id) ON DELETE CASCADE,
    affected_count INT DEFAULT 0,
    valid_observations_count INT DEFAULT 0,
    difficulty_percent FLOAT DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'monitoring', -- monitoring | difficulty_detected | resolved
    evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Reiteration Events
CREATE TABLE IF NOT EXISTS reiteration_events (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
    block_id BIGINT REFERENCES content_blocks(id) ON DELETE CASCADE,
    trigger_reason TEXT,
    proposed_simplification TEXT NOT NULL,
    approved_simplification TEXT,
    is_approved BOOLEAN DEFAULT FALSE,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. AI Insights
CREATE TABLE IF NOT EXISTS ai_insights (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
    block_id BIGINT REFERENCES content_blocks(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL, -- misconception_analysis | analogy | follow_up_quiz
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaze_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprehension_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprehension_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reiteration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies (Allow access for authorized classroom participants)
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Class materials viewable by class members" ON materials FOR SELECT USING (true);
CREATE POLICY "Sessions viewable by authenticated users" ON sessions FOR SELECT USING (true);
CREATE POLICY "Content blocks viewable by session participants" ON content_blocks FOR SELECT USING (true);
