-- ============================================================================
-- P2.HOTFIX — Atualizar trigger para permitir sport_types vazio em SETUP
-- ============================================================================
-- Tenants em status SETUP podem ter sport_types vazio porque a modalidade
-- será definida durante o onboarding.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_tenant_sport_types()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- ✅ P2.HOTFIX: Permitir sport_types vazio para tenants em SETUP
  -- A validação só é aplicada para tenants ACTIVE
  IF NEW.status = 'SETUP' THEN
    RETURN NEW;
  END IF;
  
  -- Para tenants ACTIVE ou SUSPENDED, sport_types é obrigatório
  IF NEW.sport_types IS NULL OR array_length(NEW.sport_types, 1) IS NULL OR array_length(NEW.sport_types, 1) = 0 THEN
    RAISE EXCEPTION 'sport_types is required and must contain at least one modality';
  END IF;
  
  RETURN NEW;
END;
$$;