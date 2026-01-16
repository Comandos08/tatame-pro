-- =============================================================================
-- V1 HARDENING: Segurança RLS
-- =============================================================================

-- 1. TABELAS ÓRFÃS: Adicionar policies restritivas
-- -----------------------------------------------------------------------------

-- password_resets: Apenas service role (usado por edge functions)
CREATE POLICY "password_resets_service_only" 
ON public.password_resets
FOR ALL
USING (false)
WITH CHECK (false);

COMMENT ON POLICY "password_resets_service_only" ON public.password_resets IS 
'V1: Bloqueia acesso direto. Tabela gerenciada apenas via service role em edge functions.';

-- webhook_events: Apenas superadmins podem visualizar para debug
CREATE POLICY "webhook_events_superadmin_only" 
ON public.webhook_events
FOR SELECT
USING (public.is_superadmin());

COMMENT ON POLICY "webhook_events_superadmin_only" ON public.webhook_events IS 
'V1: Apenas superadmins podem ver eventos de webhook para debugging.';

-- 2. POLÍTICAS DE INSERT PÚBLICAS: Adicionar validação de tenant ativo
-- -----------------------------------------------------------------------------
-- NOTA: Estes inserts públicos são INTENCIONAIS para o fluxo de filiação pública

-- Atualizar policy de athletes para validar tenant ativo
DROP POLICY IF EXISTS "Public can insert athlete for membership" ON public.athletes;
CREATE POLICY "Public can insert athlete for membership" 
ON public.athletes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenants 
    WHERE id = tenant_id 
    AND is_active = true
  )
);

COMMENT ON POLICY "Public can insert athlete for membership" ON public.athletes IS 
'V1: INSERT público INTENCIONAL para fluxo de filiação. Requer tenant ativo.';

-- Atualizar policy de guardians para validar tenant ativo
DROP POLICY IF EXISTS "Public can insert guardian for membership" ON public.guardians;
CREATE POLICY "Public can insert guardian for membership" 
ON public.guardians
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenants 
    WHERE id = tenant_id 
    AND is_active = true
  )
);

COMMENT ON POLICY "Public can insert guardian for membership" ON public.guardians IS 
'V1: INSERT público INTENCIONAL para fluxo de filiação de menores. Requer tenant ativo.';

-- Atualizar policy de guardian_links para validar tenant ativo
DROP POLICY IF EXISTS "Public can insert guardian_link for membership" ON public.guardian_links;
CREATE POLICY "Public can insert guardian_link for membership" 
ON public.guardian_links
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenants 
    WHERE id = tenant_id 
    AND is_active = true
  )
);

COMMENT ON POLICY "Public can insert guardian_link for membership" ON public.guardian_links IS 
'V1: INSERT público INTENCIONAL para vincular responsável a menor. Requer tenant ativo.';

-- Atualizar policy de documents para validar tenant ativo
DROP POLICY IF EXISTS "Public can insert documents for membership" ON public.documents;
CREATE POLICY "Public can insert documents for membership" 
ON public.documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenants 
    WHERE id = tenant_id 
    AND is_active = true
  )
);

COMMENT ON POLICY "Public can insert documents for membership" ON public.documents IS 
'V1: INSERT público INTENCIONAL para upload de documentos na filiação. Requer tenant ativo.';

-- Atualizar policy de memberships para validar tenant ativo
DROP POLICY IF EXISTS "Public can insert membership" ON public.memberships;
CREATE POLICY "Public can insert membership" 
ON public.memberships
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenants 
    WHERE id = tenant_id 
    AND is_active = true
  )
);

COMMENT ON POLICY "Public can insert membership" ON public.memberships IS 
'V1: INSERT público INTENCIONAL para criar filiação. Requer tenant ativo.';

-- 3. FORTALECER POLICY DE UPDATE EM MEMBERSHIPS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Service role can update" ON public.memberships;
CREATE POLICY "Staff and admins can update memberships" 
ON public.memberships
FOR UPDATE
USING (
  public.is_superadmin() 
  OR public.is_tenant_admin(tenant_id)
  OR public.has_role(auth.uid(), 'STAFF_ORGANIZACAO', tenant_id)
  OR (academy_id IS NOT NULL AND public.is_head_coach_of_academy(academy_id))
);

COMMENT ON POLICY "Staff and admins can update memberships" ON public.memberships IS 
'V1: Apenas staff, admins e head coaches podem atualizar filiações.';

-- 4. RESTRINGIR SELECT PÚBLICO EM ATHLETES
-- -----------------------------------------------------------------------------
-- A view athletes_public_verification já existe para verificação pública

DROP POLICY IF EXISTS "Public can view athlete for verification" ON public.athletes;
CREATE POLICY "Authenticated users can view athletes in their tenant" 
ON public.athletes
FOR SELECT
USING (
  public.is_superadmin()
  OR public.is_member_of_tenant(tenant_id)
);

COMMENT ON POLICY "Authenticated users can view athletes in their tenant" ON public.athletes IS 
'V1: SELECT restrito a membros do tenant. Verificação pública usa view athletes_public_verification.';

-- Garantir que a view de verificação pública tem permissões corretas
GRANT SELECT ON public.athletes_public_verification TO anon, authenticated;