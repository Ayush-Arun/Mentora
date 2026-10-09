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
