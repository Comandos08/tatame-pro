-- =============================================================================
-- V1 HARDENING: Remover policies INSERT com WITH CHECK (true) restantes
-- =============================================================================

-- ATHLETES: Remover policy antiga permissiva e manter apenas a nova
DROP POLICY IF EXISTS "Public can insert athletes for membership" ON public.athletes;

-- DOCUMENTS: Remover policy antiga permissiva  
DROP POLICY IF EXISTS "Public can insert documents" ON public.documents;

-- GUARDIANS: Remover policy antiga permissiva
DROP POLICY IF EXISTS "Public can insert guardians" ON public.guardians;

-- GUARDIAN_LINKS: Remover policy antiga permissiva
DROP POLICY IF EXISTS "Public can insert guardian_links" ON public.guardian_links;

-- MEMBERSHIPS: Remover policy UPDATE permissiva
DROP POLICY IF EXISTS "Service role can update memberships" ON public.memberships;

-- MEMBERSHIPS: Remover policy INSERT antiga permissiva
DROP POLICY IF EXISTS "Public can insert memberships" ON public.memberships;