-- ============================================================
-- ETAPA 2: Remove default de modalidade + trigger de validação
-- ============================================================

-- 1️⃣ Remove DEFAULT de sport_types na tabela tenants
ALTER TABLE public.tenants 
  ALTER COLUMN sport_types DROP DEFAULT;

-- 2️⃣ Trigger de validação: bloqueia INSERT sem sport_types válido
CREATE OR REPLACE FUNCTION public.validate_tenant_sport_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sport_types IS NULL OR array_length(NEW.sport_types, 1) IS NULL OR array_length(NEW.sport_types, 1) = 0 THEN
    RAISE EXCEPTION 'sport_types is required and must contain at least one modality';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_tenant_sport_types
  BEFORE INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_tenant_sport_types();