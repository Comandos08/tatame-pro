-- ============================================
-- PI-1 SAFE GOLD: Fluxo de Filiação Seguro
-- IDEMPOTENTE: Pode rodar múltiplas vezes sem erro
-- ============================================

-- ===========================================
-- PARTE 1: SCHEMA - Adicionar colunas a memberships
-- ===========================================

-- 1.1 Tornar athlete_id nullable (idempotente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'memberships' 
    AND column_name = 'athlete_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.memberships ALTER COLUMN athlete_id DROP NOT NULL;
    RAISE NOTICE 'athlete_id alterado para nullable';
  ELSE
    RAISE NOTICE 'athlete_id já é nullable ou não existe';
  END IF;
END $$;

-- 1.2 Adicionar colunas de application
ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS applicant_data JSONB DEFAULT NULL;

ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS applicant_profile_id UUID DEFAULT NULL;

ALTER TABLE public.memberships 
ADD COLUMN IF NOT EXISTS documents_uploaded JSONB DEFAULT '[]'::jsonb;

-- 1.3 Índice para buscar applications por profile
CREATE INDEX IF NOT EXISTS idx_memberships_applicant_profile 
ON public.memberships(applicant_profile_id) 
WHERE applicant_profile_id IS NOT NULL;

-- Comentários
COMMENT ON COLUMN public.memberships.applicant_data IS 
'Dados pessoais temporários do candidato antes da aprovação';

COMMENT ON COLUMN public.memberships.applicant_profile_id IS 
'UUID do auth.users que criou a solicitação de filiação';

COMMENT ON COLUMN public.memberships.documents_uploaded IS 
'Array de referências aos documentos enviados: [{type, storage_path, file_type}]';

-- ===========================================
-- PARTE 2: RLS MEMBERSHIPS
-- ===========================================

-- 2.1 Remover policy antiga insegura
DROP POLICY IF EXISTS "Public can insert membership" ON public.memberships;

-- 2.2 Policy estrita para INSERT autenticado
DROP POLICY IF EXISTS "Authenticated users can insert membership application" ON public.memberships;

CREATE POLICY "Authenticated users can insert membership application"
ON public.memberships
FOR INSERT
TO authenticated
WITH CHECK (
  applicant_profile_id = auth.uid()
  AND athlete_id IS NULL
  AND EXISTS (SELECT 1 FROM tenants WHERE id = tenant_id AND is_active = true)
);

-- 2.3 Policy para usuário ver suas próprias applications
DROP POLICY IF EXISTS "Users can view own membership applications" ON public.memberships;

CREATE POLICY "Users can view own membership applications"
ON public.memberships
FOR SELECT
TO authenticated
USING (
  applicant_profile_id = auth.uid()
);

-- ===========================================
-- PARTE 3: RLS STORAGE - RESTRITIVO TOTAL
-- ===========================================

-- 3.1 Remover policy anônima (CRÍTICO)
DROP POLICY IF EXISTS "Public can upload documents for membership" ON storage.objects;

-- 3.2 Remover policy permissiva de authenticated
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;

-- 3.3 Policy ÚNICA e RESTRITA para INSERT em documents
DROP POLICY IF EXISTS "Authenticated users can upload to tmp folder" ON storage.objects;

CREATE POLICY "Authenticated users can upload to tmp folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'tmp'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 3.4 Policy ÚNICA e RESTRITA para SELECT em documents
DROP POLICY IF EXISTS "Authenticated users can read own tmp files" ON storage.objects;

CREATE POLICY "Authenticated users can read own tmp files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'tmp'
  AND (storage.foldername(name))[2] = auth.uid()::text
);