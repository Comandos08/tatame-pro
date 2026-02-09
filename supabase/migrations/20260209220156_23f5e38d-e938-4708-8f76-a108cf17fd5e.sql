
-- ============================================================
-- PI A2: Infraestrutura de Badges (Reconhecimento Simbólico)
-- Separação formal: Identidade (app_role) ≠ Reconhecimento (badge)
-- Somente infraestrutura passiva. Zero funcionalidade ativa.
-- ============================================================

-- 1. Tabela badges
CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'TENANT',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- 2. Tabela athlete_badges
CREATE TABLE public.athlete_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id),
  badge_id uuid NOT NULL REFERENCES public.badges(id),
  granted_by uuid REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (athlete_id, badge_id)
);

-- 3. Enable RLS (fail-closed)
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_badges ENABLE ROW LEVEL SECURITY;

-- 4. RLS: badges — SELECT only
CREATE POLICY "Read badges" ON public.badges
FOR SELECT
USING (
  is_superadmin()
  OR is_tenant_admin(tenant_id)
  OR EXISTS (
    SELECT 1 FROM public.athletes a
    WHERE a.profile_id = auth.uid()
      AND a.tenant_id = badges.tenant_id
  )
);

-- 5. RLS: athlete_badges — SELECT only
CREATE POLICY "Read athlete badges" ON public.athlete_badges
FOR SELECT
USING (
  is_superadmin()
  OR is_tenant_admin(tenant_id)
  OR auth.uid() = (
    SELECT a.profile_id FROM public.athletes a
    WHERE a.id = athlete_badges.athlete_id
  )
);

-- 6. Triggers updated_at
CREATE TRIGGER update_badges_updated_at
  BEFORE UPDATE ON public.badges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_athlete_badges_updated_at
  BEFORE UPDATE ON public.athlete_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
