-- Add card_template_url and diploma_template_url to tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS card_template_url text,
ADD COLUMN IF NOT EXISTS diploma_template_url text;

-- Add content_hash_sha256 to digital_cards
ALTER TABLE public.digital_cards 
ADD COLUMN IF NOT EXISTS content_hash_sha256 text;

-- Add content_hash_sha256 to diplomas
ALTER TABLE public.diplomas 
ADD COLUMN IF NOT EXISTS content_hash_sha256 text;

-- Create branding storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to branding bucket
CREATE POLICY "Public can view branding files"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding');

-- Tenant admins can upload to their tenant folder
CREATE POLICY "Tenant admins can upload branding"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'branding' 
  AND (
    is_superadmin() 
    OR is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, (storage.foldername(name))[1]::uuid)
  )
);

-- Tenant admins can update their branding files
CREATE POLICY "Tenant admins can update branding"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'branding' 
  AND (
    is_superadmin() 
    OR is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, (storage.foldername(name))[1]::uuid)
  )
);

-- Tenant admins can delete their branding files
CREATE POLICY "Tenant admins can delete branding"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'branding' 
  AND (
    is_superadmin() 
    OR is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR has_role(auth.uid(), 'STAFF_ORGANIZACAO'::app_role, (storage.foldername(name))[1]::uuid)
  )
);