-- PI-2: Campos de rejeição e índice de performance

-- Adicionar campos de rejeição
ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;

ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS rejected_by_profile_id UUID DEFAULT NULL;

-- Índice para buscar applications pendentes (idempotente)
CREATE INDEX IF NOT EXISTS idx_memberships_pending_review 
ON public.memberships(tenant_id, status, created_at) 
WHERE status = 'PENDING_REVIEW';

-- RLS: Admin pode ler documentos temporários para revisão
CREATE POLICY "Admin can read tmp files for review"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'tmp'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('ADMIN_TENANT', 'STAFF_ORGANIZACAO', 'SUPERADMIN_GLOBAL')
  )
);