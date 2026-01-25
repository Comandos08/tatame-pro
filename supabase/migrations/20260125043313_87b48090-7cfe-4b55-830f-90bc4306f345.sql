-- =====================================================================
-- P4.3 — Events Storage Bucket
-- =====================================================================
-- ARCHITECTURAL DECISION: public = true means any generated URL is accessible.
-- Business rule: Only PUBLISHED events should have images uploaded.
-- Events in DRAFT should not have publicly visible uploads.
-- =====================================================================

-- Create bucket 'events' (public for cover images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('events', 'events', true)
ON CONFLICT (id) DO NOTHING;

-- Public can view event images (read access)
CREATE POLICY "Public can view event images"
ON storage.objects FOR SELECT
USING (bucket_id = 'events');

-- Tenant admins can upload event images
-- Path pattern: events/{tenant_id}/{event_id}/cover.jpg
CREATE POLICY "Tenant admins can upload event images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'events' 
  AND (
    is_superadmin() 
    OR is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, (storage.foldername(name))[1]::uuid)
  )
);

-- Tenant admins can update event images
CREATE POLICY "Tenant admins can update event images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'events' 
  AND (
    is_superadmin() 
    OR is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, (storage.foldername(name))[1]::uuid)
  )
);

-- Tenant admins can delete event images
CREATE POLICY "Tenant admins can delete event images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'events' 
  AND (
    is_superadmin() 
    OR is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, (storage.foldername(name))[1]::uuid)
  )
);